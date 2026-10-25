// Household login: PIN hashed with scrypt, session in a signed httpOnly cookie (HMAC-SHA256).
// Players have no passwords — whoever is logged in to the household may pick any profile.

import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { requireEnv } from './env.ts';

export const COOKIE_NAME = 'dl_household';
/** One year: the household logs in once per device. */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const SCRYPT_KEYLEN = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

function scryptAsync(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, SCRYPT_KEYLEN, SCRYPT_OPTS, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** 4–8 digits. */
export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

/** `scrypt$<salt b64url>$<hash b64url>` */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scryptAsync(pin, Buffer.from(saltB64, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function cookieSecret(): string {
  const secret = requireEnv('HOUSEHOLD_COOKIE_SECRET');
  if (secret.length < 16) throw new Error('[auth] HOUSEHOLD_COOKIE_SECRET is too short (min 16 chars)');
  return secret;
}

/** Cookie value `<householdId>.<issuedAt seconds>.<hmac>`. */
export function createSessionToken(householdId: number, now = Date.now(), secret = cookieSecret()): string {
  const payload = `${householdId}.${Math.floor(now / 1000)}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Household id from a valid, unexpired token; null otherwise. */
export function readSessionToken(token: string | undefined | null, now = Date.now(), secret = cookieSecret()): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, issued, sig] = parts;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(issued)) return null;
  const expected = Buffer.from(sign(`${id}.${issued}`, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const age = Math.floor(now / 1000) - Number(issued);
  if (age < -60 || age > COOKIE_MAX_AGE) return null;
  return Number(id);
}

export interface CookieJar {
  set(name: string, value: string, opts: { path: string; httpOnly?: boolean; sameSite?: 'lax' | 'strict' | 'none'; secure?: boolean; maxAge?: number }): void;
  delete(name: string, opts: { path: string }): void;
}

/**
 * `secure` follows the request scheme: the app runs on plain HTTP inside the tailnet,
 * where a secure cookie would never be sent back.
 */
export function setSessionCookie(cookies: CookieJar, householdId: number, secure: boolean): void {
  cookies.set(COOKIE_NAME, createSessionToken(householdId), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearSessionCookie(cookies: CookieJar): void {
  cookies.delete(COOKIE_NAME, { path: '/' });
}
