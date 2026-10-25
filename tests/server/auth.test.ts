import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ACCOUNT_SESSION_MAX_AGE,
  COOKIE_MAX_AGE,
  COOKIE_NAME,
  createDeviceToken,
  createSessionToken,
  DEVICE_COOKIE_NAME,
  hashPin,
  isValidPin,
  normalizeEmail,
  passwordProblem,
  readDeviceToken,
  readSessionToken,
  verifyPin,
} from '#lib/server/auth.ts';
import { createHash, createHmac } from 'node:crypto';
import { query } from '#lib/server/db.ts';
import { resetRateLimits } from '#lib/server/rate-limit.ts';
import { createHousehold, type Household } from '#lib/server/repo/households.ts';
import { PIN_MAX_ATTEMPTS } from '#lib/server/services/accounts.ts';
import { POST as login } from '../../src/routes/api/login/+server.ts';
import { GET as me } from '../../src/routes/api/me/+server.ts';
import { cleanup, fakeCookies, fakeEvent, httpError, makeManager } from './helpers.ts';

const SECRET = 'unit-test-secret-0123456789';
const NOW = new Date('2026-10-25T10:00:00Z').getTime();
const created: Household[] = [];

afterAll(() => cleanup(created));
beforeEach(() => resetRateLimits());

describe('PIN and password rules', () => {
  it('accepts 4–8 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin(1234)).toBe(false);
  });

  it('verifies the right PIN and rejects a wrong one', async () => {
    const hash = await hashPin('2468');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPin('2468', hash)).toBe(true);
    expect(await verifyPin('2469', hash)).toBe(false);
  });

  it('salts every hash and rejects a malformed or missing one', async () => {
    expect(await hashPin('2468')).not.toBe(await hashPin('2468'));
    expect(await verifyPin('2468', 'plain')).toBe(false);
    expect(await verifyPin('2468', null)).toBe(false);
  });

  it('wants passwords of 10 to 200 characters', () => {
    expect(passwordProblem('krátké')).toMatch(/aspoň 10/);
    expect(passwordProblem('x'.repeat(201))).toMatch(/nejvýš 200/);
    expect(passwordProblem(' '.repeat(12))).toMatch(/mezer/);
    expect(passwordProblem(undefined)).toBe('Zadej heslo.');
    expect(passwordProblem('dlouhé heslo 1')).toBeNull();
  });

  it('normalizes e-mails and rejects garbage', () => {
    expect(normalizeEmail('  Tomas@Example.CZ ')).toBe('tomas@example.cz');
    expect(normalizeEmail('bez-zavinace')).toBeNull();
    expect(normalizeEmail('a b@c.cz')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe('session cookie', () => {
  const claims = { householdId: 42, accountId: 7, sessionVersion: 3 };

  it('round-trips household, account and session version', () => {
    const token = createSessionToken(claims, NOW, SECRET);
    expect(readSessionToken(token, NOW + 1000, SECRET)).toEqual(claims);
  });

  it('treats a bare household id as a PIN/device session', () => {
    expect(readSessionToken(createSessionToken(42, NOW, SECRET), NOW, SECRET)).toEqual({ householdId: 42, accountId: null, sessionVersion: 0 });
  });

  it('still accepts the cookie format from before accounts as a device session', () => {
    const payload = `42.${Math.floor(NOW / 1000)}`;
    const legacy = `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
    expect(readSessionToken(legacy, NOW, SECRET)).toEqual({ householdId: 42, accountId: null, sessionVersion: 0 });
  });

  it('rejects a tampered household or account id', () => {
    const parts = createSessionToken(claims, NOW, SECRET).split('.');
    expect(readSessionToken(['2', '43', ...parts.slice(2)].join('.'), NOW, SECRET)).toBeNull();
    expect(readSessionToken(['2', '42', '8', ...parts.slice(3)].join('.'), NOW, SECRET)).toBeNull();
  });

  it('rejects a token signed with another secret, garbage and missing tokens', () => {
    expect(readSessionToken(createSessionToken(claims, NOW, 'another-secret-0123456789'), NOW, SECRET)).toBeNull();
    expect(readSessionToken('nonsense', NOW, SECRET)).toBeNull();
    expect(readSessionToken('1.2.3.4', NOW, SECRET)).toBeNull();
    expect(readSessionToken(undefined, NOW, SECRET)).toBeNull();
  });

  it('expires account sessions after 30 days and device sessions after a year', () => {
    expect(readSessionToken(createSessionToken(claims, NOW, SECRET), NOW + (ACCOUNT_SESSION_MAX_AGE + 10) * 1000, SECRET)).toBeNull();
    expect(readSessionToken(createSessionToken(42, NOW, SECRET), NOW + (ACCOUNT_SESSION_MAX_AGE + 10) * 1000, SECRET)).not.toBeNull();
    expect(readSessionToken(createSessionToken(42, NOW, SECRET), NOW + (COOKIE_MAX_AGE + 10) * 1000, SECRET)).toBeNull();
  });

  it('keeps device tokens apart from session tokens', () => {
    const device = createDeviceToken(42, NOW, SECRET);
    expect(readDeviceToken(device, NOW, SECRET)).toBe(42);
    // A device cookie is not a login, and a legacy session cookie is not a device cookie.
    expect(readSessionToken(device, NOW, SECRET)).toBeNull();
    const payload = `42.${Math.floor(NOW / 1000)}`;
    expect(readDeviceToken(`${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`, NOW, SECRET)).toBeNull();
    expect(createHash('sha256').update(device).digest('hex')).toHaveLength(64);
  });
});

describe('POST /api/login (PIN)', () => {
  it('logs in a household without account by name and remembers the device', async () => {
    const household = await createHousehold(`Test legacy ${Date.now()}`, await hashPin('1357'));
    created.push(household);
    const cookies = fakeCookies();
    const res = await login(fakeEvent({ body: { name: household.name, pin: '1357' }, cookies }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ household: { id: household.id, name: household.name }, account: null });
    const cookie = cookies.jar.get(COOKIE_NAME)!;
    expect(cookie.opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: false });
    expect(readSessionToken(cookie.value)).toEqual({ householdId: household.id, accountId: null, sessionVersion: 0 });
    expect(readDeviceToken(cookies.jar.get(DEVICE_COOKIE_NAME)!.value)).toBe(household.id);
  });

  it('marks cookies Secure behind HTTPS', async () => {
    const household = created[0];
    const cookies = fakeCookies();
    await login(fakeEvent({ url: 'https://liga.example.test/api/login', body: { name: household.name, pin: '1357' }, cookies }));
    expect(cookies.jar.get(COOKIE_NAME)!.opts.secure).toBe(true);
    expect(cookies.jar.get(DEVICE_COOKIE_NAME)!.opts.secure).toBe(true);
  });

  it('answers 401 with a Czech message for a wrong PIN', async () => {
    const err = await httpError(() => login(fakeEvent({ body: { name: created[0].name, pin: '0000' } })));
    expect(err).toEqual({ status: 401, message: 'Špatný PIN.' });
    await query('UPDATE households SET pin_failed_attempts = 0 WHERE id = $1', [created[0].id]);
  });

  it('does not find a household with an account by its name', async () => {
    const m = await makeManager('pin-name', { pin: '2468' });
    created.push(m.household);
    const err = await httpError(() => login(fakeEvent({ body: { name: m.household.name, pin: '2468' } })));
    expect(err.status).toBe(401);
  });

  it('logs in by PIN on a device remembered by the account login', async () => {
    const m = await makeManager('pin-device', { pin: '2468' });
    created.push(m.household);
    const res = await login(fakeEvent({ body: { pin: '2468' }, deviceHouseholdId: m.household.id }));
    expect((await res.json()).household.id).toBe(m.household.id);
  });

  it('asks for the PIN to be set first when the household has none', async () => {
    const m = await makeManager('pin-none');
    created.push(m.household);
    const err = await httpError(() => login(fakeEvent({ body: { pin: '2468' }, deviceHouseholdId: m.household.id })));
    expect(err.status).toBe(409);
  });

  it('locks the PIN after repeated wrong attempts, even the right one', async () => {
    const m = await makeManager('pin-lock', { pin: '2468' });
    created.push(m.household);
    const attempt = (pin: string, i: number) => httpError(() => login(fakeEvent({ body: { pin }, deviceHouseholdId: m.household.id, ip: `198.51.100.${i}` })));
    for (let i = 1; i < PIN_MAX_ATTEMPTS; i++) expect((await attempt('0000', i)).status).toBe(401);
    expect((await attempt('0000', 99)).status).toBe(423);
    const right = await attempt('2468', 100);
    expect(right.status).toBe(423);
    expect(right.message).toMatch(/zamčený/);
  });

  it('answers 400 for a malformed PIN and for a body that is not JSON', async () => {
    expect((await httpError(() => login(fakeEvent({ body: { pin: 'abc' } })))).status).toBe(400);
    expect((await httpError(() => login(fakeEvent({ body: '{nope' })))).status).toBe(400);
  });
});

describe('GET /api/me', () => {
  it('returns the logged-in household as a PIN device', async () => {
    const res = await me(fakeEvent({ household: created[0] }));
    expect(await res.json()).toMatchObject({ household: { id: created[0].id, name: created[0].name }, account: null, role: 'device', needs_account: true, has_pin: true });
  });

  it('returns the manager for an account session', async () => {
    const m = await makeManager('me');
    created.push(m.household);
    const res = await me(fakeEvent({ household: m.household, account: m.account }));
    expect(await res.json()).toMatchObject({ role: 'manager', account: { email: m.email, email_verified: true }, needs_account: false, has_pin: false });
  });

  it('offers the PIN login on a remembered device when logged out', async () => {
    const res = await me(fakeEvent({ deviceHouseholdId: created[0].id }));
    expect(await res.json()).toMatchObject({ household: null, role: null, device_household: { id: created[0].id, name: created[0].name, has_pin: true } });
  });

  it('never asks for the old first-run setup', async () => {
    expect(await (await me(fakeEvent())).json()).toMatchObject({ household: null, setup_required: false, device_household: null });
  });
});
