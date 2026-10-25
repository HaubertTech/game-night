import { afterAll, describe, expect, it } from 'vitest';
import { COOKIE_MAX_AGE, COOKIE_NAME, createSessionToken, hashPin, isValidPin, readSessionToken, verifyPin } from '#lib/server/auth.ts';
import { createHousehold, type Household } from '#lib/server/repo/households.ts';
import { POST as login } from '../../src/routes/api/login/+server.ts';
import { GET as me } from '../../src/routes/api/me/+server.ts';
import { cleanup, fakeCookies, fakeEvent, httpError } from './helpers.ts';

const SECRET = 'unit-test-secret-0123456789';
const NOW = new Date('2026-10-25T10:00:00Z').getTime();
const created: Household[] = [];

afterAll(() => cleanup(created));

describe('PIN', () => {
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

  it('salts every hash', async () => {
    expect(await hashPin('2468')).not.toBe(await hashPin('2468'));
  });

  it('rejects a malformed stored hash', async () => {
    expect(await verifyPin('2468', 'plain')).toBe(false);
  });
});

describe('session cookie', () => {
  it('round-trips the household id', () => {
    const token = createSessionToken(42, NOW, SECRET);
    expect(readSessionToken(token, NOW + 1000, SECRET)).toBe(42);
  });

  it('rejects a tampered household id', () => {
    const [, issued, sig] = createSessionToken(42, NOW, SECRET).split('.');
    expect(readSessionToken(`43.${issued}.${sig}`, NOW, SECRET)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    expect(readSessionToken(createSessionToken(42, NOW, 'another-secret-0123456789'), NOW, SECRET)).toBeNull();
  });

  it('rejects garbage and missing tokens', () => {
    expect(readSessionToken('nonsense', NOW, SECRET)).toBeNull();
    expect(readSessionToken('1.2.3.4', NOW, SECRET)).toBeNull();
    expect(readSessionToken(undefined, NOW, SECRET)).toBeNull();
  });

  it('expires after the max age', () => {
    const token = createSessionToken(42, NOW, SECRET);
    expect(readSessionToken(token, NOW + (COOKIE_MAX_AGE + 10) * 1000, SECRET)).toBeNull();
  });
});

describe('POST /api/login', () => {
  it('sets an httpOnly SameSite=Lax cookie for the right PIN', async () => {
    const household = await createHousehold(`Test login ${Date.now()}`, await hashPin('1357'));
    created.push(household);
    const cookies = fakeCookies();
    const res = await login(fakeEvent({ body: { name: household.name, pin: '1357' }, cookies }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ household: { id: household.id, name: household.name } });
    const cookie = cookies.jar.get(COOKIE_NAME)!;
    expect(cookie.opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: false });
    expect(readSessionToken(cookie.value)).toBe(household.id);
  });

  it('answers 401 with a Czech message for a wrong PIN', async () => {
    const household = created[0];
    const err = await httpError(() => login(fakeEvent({ body: { name: household.name, pin: '0000' } })));
    expect(err).toEqual({ status: 401, message: 'Špatný PIN.' });
  });

  it('answers 400 for a malformed PIN', async () => {
    const err = await httpError(() => login(fakeEvent({ body: { pin: 'abc' } })));
    expect(err.status).toBe(400);
  });

  it('answers 400 for a body that is not JSON', async () => {
    const err = await httpError(() => login(fakeEvent({ body: '{nope' })));
    expect(err.status).toBe(400);
  });
});

describe('GET /api/me', () => {
  it('returns the logged-in household', async () => {
    const res = await me(fakeEvent({ household: created[0] }));
    expect(await res.json()).toEqual({ household: { id: created[0].id, name: created[0].name }, setup_required: false });
  });

  it('does not ask for setup when a household exists', async () => {
    const res = await me(fakeEvent());
    expect(await res.json()).toEqual({ household: null, setup_required: false });
  });
});
