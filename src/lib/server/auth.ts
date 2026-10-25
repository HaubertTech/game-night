// Household login.
// - Account (e-mail + password, scrypt): the household manager; full rights incl. export and deletion.
// - Device PIN: quick login on a shared device (TV/tablet) that an account has logged in before
//   (the device cookie remembers the household). Play rights only.
// Players have no passwords — whoever is logged in to the household may pick any profile.
// Sessions live in signed httpOnly cookies (HMAC-SHA256).

import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { requireEnv } from './env.ts';

export const COOKIE_NAME = 'dl_household';
/** Remembers which household this device belongs to (enables the PIN login). */
export const DEVICE_COOKIE_NAME = 'dl_device';
/** PIN/device sessions: one year, the household logs in once per device. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** Account sessions are shorter; after that the device falls back to the PIN login. */
export const ACCOUNT_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

const SCRYPT_KEYLEN = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scryptAsync(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret.normalize('NFKC'), salt, SCRYPT_KEYLEN, SCRYPT_OPTS, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** `scrypt$<salt b64url>$<hash b64url>` */
async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(secret, salt);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scryptAsync(secret, Buffer.from(saltB64, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** 4–8 digits. */
export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

export const hashPin = (pin: string) => hashSecret(pin);
export const verifyPin = (pin: string, stored: string | null | undefined) => verifySecret(pin, stored);

/** Czech message when the password is not acceptable, null when it is. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || !password) return 'Zadej heslo.';
  if (password.length < PASSWORD_MIN_LENGTH) return `Heslo musí mít aspoň ${PASSWORD_MIN_LENGTH} znaků.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Heslo může mít nejvýš ${PASSWORD_MAX_LENGTH} znaků.`;
  if (!password.trim()) return 'Heslo nesmí být jen z mezer.';
  return null;
}

export const hashPassword = (password: string) => hashSecret(password);
export const verifyPassword = (password: string, stored: string | null | undefined) => verifySecret(password, stored);

/** Lower-cased, trimmed e-mail or null when it does not look like one. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  // Deliberately simple: one @, something on both sides, a dot in the domain, no spaces.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Random one-time token for e-mail links (256 bits) and its sha256 for the database. */
export function newOneTimeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashOneTimeToken(token) };
}

export function hashOneTimeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function cookieSecret(): string {
  const secret = requireEnv('HOUSEHOLD_COOKIE_SECRET');
  if (secret.length < 16) throw new Error('[auth] HOUSEHOLD_COOKIE_SECRET is too short (min 16 chars)');
  return secret;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface SessionClaims {
  householdId: number;
  /** null for a PIN/device session (and for cookies issued before accounts existed). */
  accountId: number | null;
  sessionVersion: number;
}

/**
 * Cookie value `2.<householdId>.<accountId|0>.<sessionVersion>.<issuedAt s>.<hmac>`.
 * A bare household id is a PIN/device session.
 */
export function createSessionToken(claims: SessionClaims | number, now = Date.now(), secret = cookieSecret()): string {
  const c = typeof claims === 'number' ? { householdId: claims, accountId: null, sessionVersion: 0 } : claims;
  const payload = `2.${c.householdId}.${c.accountId ?? 0}.${c.sessionVersion}.${Math.floor(now / 1000)}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Claims from a valid, unexpired token; null otherwise. Accepts the pre-account format `<id>.<issued>.<hmac>`. */
export function readSessionToken(token: string | undefined | null, now = Date.now(), secret = cookieSecret()): SessionClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  let claims: SessionClaims;
  let issued: string;
  if (parts.length === 3) {
    const [id, iss, sig] = parts;
    if (!/^\d{1,15}$/.test(id) || !/^\d{1,15}$/.test(iss)) return null;
    if (!safeEqual(sign(`${id}.${iss}`, secret), sig)) return null;
    claims = { householdId: Number(id), accountId: null, sessionVersion: 0 };
    issued = iss;
  } else if (parts.length === 6 && parts[0] === '2') {
    const [, id, account, version, iss, sig] = parts;
    if (![id, account, version, iss].every((p) => /^\d{1,15}$/.test(p))) return null;
    if (!safeEqual(sign(parts.slice(0, 5).join('.'), secret), sig)) return null;
    claims = { householdId: Number(id), accountId: Number(account) || null, sessionVersion: Number(version) };
    issued = iss;
  } else {
    return null;
  }
  if (!claims.householdId) return null;
  const maxAge = claims.accountId ? ACCOUNT_SESSION_MAX_AGE : COOKIE_MAX_AGE;
  const age = Math.floor(now / 1000) - Number(issued);
  if (age < -60 || age > maxAge) return null;
  return claims;
}

/** Device cookie `<householdId>.<issuedAt s>.<hmac>`, signed under a separate purpose. */
export function createDeviceToken(householdId: number, now = Date.now(), secret = cookieSecret()): string {
  const payload = `${householdId}.${Math.floor(now / 1000)}`;
  return `${payload}.${sign(`device:${payload}`, secret)}`;
}

export function readDeviceToken(token: string | undefined | null, now = Date.now(), secret = cookieSecret()): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, issued, sig] = parts;
  if (!/^\d{1,15}$/.test(id) || !/^\d{1,15}$/.test(issued)) return null;
  if (!safeEqual(sign(`device:${id}.${issued}`, secret), sig)) return null;
  const age = Math.floor(now / 1000) - Number(issued);
  if (age < -60 || age > DEVICE_COOKIE_MAX_AGE) return null;
  return Number(id) || null;
}

export interface CookieJar {
  get?(name: string): string | undefined;
  set(name: string, value: string, opts: { path: string; httpOnly?: boolean; sameSite?: 'lax' | 'strict' | 'none'; secure?: boolean; maxAge?: number }): void;
  delete(name: string, opts: { path: string }): void;
}

/** `secure` must follow the real scheme (see security.ts isSecureRequest). */
export function setSessionCookie(cookies: CookieJar, claims: SessionClaims | number, secure: boolean): void {
  const accountSession = typeof claims !== 'number' && claims.accountId !== null;
  cookies.set(COOKIE_NAME, createSessionToken(claims), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: accountSession ? ACCOUNT_SESSION_MAX_AGE : COOKIE_MAX_AGE,
  });
}

export function setDeviceCookie(cookies: CookieJar, householdId: number, secure: boolean): void {
  cookies.set(DEVICE_COOKIE_NAME, createDeviceToken(householdId), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
}

export function clearSessionCookie(cookies: CookieJar): void {
  cookies.delete(COOKIE_NAME, { path: '/' });
}

export function clearDeviceCookie(cookies: CookieJar): void {
  cookies.delete(DEVICE_COOKIE_NAME, { path: '/' });
}
