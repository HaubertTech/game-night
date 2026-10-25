// Registration, login, e-mail verification, password reset, invites, „Doplnit účet“ and the
// purge of unverified accounts — through the route handlers, against the test database.

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COOKIE_NAME, DEVICE_COOKIE_NAME, hashPin, readSessionToken } from '#lib/server/auth.ts';
import { one, query } from '#lib/server/db.ts';
import { setMailer } from '#lib/server/mailer.ts';
import { resetRateLimits } from '#lib/server/rate-limit.ts';
import { getAccount } from '#lib/server/repo/accounts.ts';
import { createHousehold, getHousehold, type Household } from '#lib/server/repo/households.ts';
import { purgeUnverified } from '#lib/server/services/retention.ts';
import { POST as register } from '../../src/routes/api/auth/register/+server.ts';
import { POST as loginRoute } from '../../src/routes/api/auth/login/+server.ts';
import { POST as verifyRoute } from '../../src/routes/api/auth/verify/+server.ts';
import { POST as resendRoute } from '../../src/routes/api/auth/verify/resend/+server.ts';
import { POST as resetRequest } from '../../src/routes/api/auth/reset/request/+server.ts';
import { POST as resetRoute } from '../../src/routes/api/auth/reset/+server.ts';
import { POST as claimRoute } from '../../src/routes/api/account/claim/+server.ts';
import { DELETE as deleteAccountRoute } from '../../src/routes/api/account/+server.ts';
import { POST as inviteRoute } from '../../src/routes/api/invites/+server.ts';
import { GET as inviteInfoRoute, POST as acceptRoute } from '../../src/routes/api/invites/accept/+server.ts';
import { POST as oldSetup, PATCH as patchHousehold } from '../../src/routes/api/household/+server.ts';
import { captureMail, cleanup, fakeCookies, fakeEvent, httpError, makeManager } from './helpers.ts';

const created: Household[] = [];
let mail = captureMail();
const PASSWORD = 'správné-heslo-42';
const uniq = () => Math.random().toString(36).slice(2, 10);

beforeEach(() => {
  resetRateLimits();
  mail = captureMail();
  setMailer(mail.mailer);
});
afterEach(() => setMailer(null));
afterAll(() => cleanup(created));

async function registerNew(email = `reg-${uniq()}@example.test`, extra: Record<string, unknown> = {}) {
  const cookies = fakeCookies();
  const res = await register(fakeEvent({ body: { email, password: PASSWORD, household_name: 'Novákovi', accept_terms: true, ...extra }, cookies }));
  const body = await res.json();
  if (body.household) created.push({ id: body.household.id, name: body.household.name, created_at: new Date() });
  return { res, body, cookies, email };
}

describe('registration', () => {
  it('creates the household and manager, logs in and sends the verification link', async () => {
    const { res, body, cookies, email } = await registerNew(`  Reg-${uniq()}@Example.TEST `);
    expect(res.status).toBe(201);
    expect(body.account).toMatchObject({ email: email.trim().toLowerCase(), email_verified: false });
    expect(body.household.name).toBe('Novákovi');
    const claims = readSessionToken(cookies.jar.get(COOKIE_NAME)!.value)!;
    expect(claims).toMatchObject({ householdId: body.household.id, accountId: body.account.id });
    expect(cookies.jar.get(DEVICE_COOKIE_NAME)).toBeDefined();
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].text).toContain('http://localhost/ucet/overeni?token=');
    const row = await one<{ terms_version: string; password_hash: string }>('SELECT terms_version, password_hash FROM accounts WHERE id = $1', [body.account.id]);
    expect(row!.terms_version).toBe('2026-10-25');
    expect(row!.password_hash).toMatch(/^scrypt\$/);
    expect(row!.password_hash).not.toContain(PASSWORD);
  });

  it('allows two households with the same name', async () => {
    const a = await registerNew();
    const b = await registerNew();
    expect(a.body.household.id).not.toBe(b.body.household.id);
  });

  it('refuses a second account for the same e-mail in any letter case', async () => {
    const { email } = await registerNew();
    const err = await httpError(() => register(fakeEvent({ body: { email: email.toUpperCase(), password: PASSWORD, household_name: 'X', accept_terms: true } })));
    expect(err.status).toBe(409);
  });

  it('validates password, e-mail, name and consent', async () => {
    const base = { email: `v-${uniq()}@example.test`, password: PASSWORD, household_name: 'Ok', accept_terms: true };
    expect((await httpError(() => register(fakeEvent({ body: { ...base, password: 'kratke' } })))).message).toMatch(/aspoň 10/);
    expect((await httpError(() => register(fakeEvent({ body: { ...base, email: 'nope' } })))).status).toBe(400);
    expect((await httpError(() => register(fakeEvent({ body: { ...base, household_name: '  ' } })))).status).toBe(400);
    expect((await httpError(() => register(fakeEvent({ body: { ...base, accept_terms: false } })))).message).toMatch(/souhlasu/);
  });

  it('no longer creates households through the old first-run endpoint', async () => {
    expect((await httpError(() => oldSetup(fakeEvent({ body: { name: 'X', pin: '1234' } }) as never))).status).toBe(410);
  });
});

describe('login with e-mail and password', () => {
  it('logs in with the right password, case-insensitive e-mail', async () => {
    const m = await makeManager('login');
    created.push(m.household);
    const cookies = fakeCookies();
    const res = await loginRoute(fakeEvent({ body: { email: m.email.toUpperCase(), password: m.password }, cookies }));
    expect((await res.json()).account.id).toBe(m.account.id);
    expect(readSessionToken(cookies.jar.get(COOKIE_NAME)!.value)!.accountId).toBe(m.account.id);
  });

  it('gives the same answer for a wrong password and an unknown e-mail', async () => {
    const m = await makeManager('login2');
    created.push(m.household);
    const wrong = await httpError(() => loginRoute(fakeEvent({ body: { email: m.email, password: 'spatne-heslo-123' } })));
    const unknown = await httpError(() => loginRoute(fakeEvent({ body: { email: `nobody-${uniq()}@example.test`, password: 'spatne-heslo-123' } })));
    expect(wrong).toEqual({ status: 401, message: 'Špatný e-mail nebo heslo.' });
    expect(unknown).toEqual(wrong);
  });
});

describe('e-mail verification', () => {
  it('verifies with the link once; a second use is refused', async () => {
    const { body, email } = await registerNew();
    const token = mail.token(email, '/ucet/overeni');
    const res = await verifyRoute(fakeEvent({ body: { token } }));
    expect(await res.json()).toMatchObject({ email_verified: true });
    expect((await getAccount(body.account.id))!.email_verified_at).not.toBeNull();
    expect((await httpError(() => verifyRoute(fakeEvent({ body: { token } })))).status).toBe(410);
  });

  it('refuses an expired link', async () => {
    const { email } = await registerNew();
    const token = mail.token(email, '/ucet/overeni');
    await query(`UPDATE account_tokens SET expires_at = now() - interval '1 minute' WHERE kind = 'verify' AND used_at IS NULL`);
    expect((await httpError(() => verifyRoute(fakeEvent({ body: { token } })))).status).toBe(410);
  });

  it('stores only the hash of the token', async () => {
    const { body, email } = await registerNew();
    const token = mail.token(email, '/ucet/overeni');
    const rows = await query<{ token_hash: string }>('SELECT token_hash FROM account_tokens WHERE account_id = $1', [body.account.id]);
    expect(rows.every((r) => r.token_hash !== token && /^[0-9a-f]{64}$/.test(r.token_hash))).toBe(true);
  });

  it('resends a new link and invalidates the old one', async () => {
    const { body, email } = await registerNew();
    const first = mail.token(email, '/ucet/overeni');
    const account = (await getAccount(body.account.id))!;
    await resendRoute(fakeEvent({ method: 'POST', household: { id: body.household.id, name: body.household.name, created_at: new Date() }, account }));
    const second = mail.token(email, '/ucet/overeni');
    expect(second).not.toBe(first);
    expect((await httpError(() => verifyRoute(fakeEvent({ body: { token: first } })))).status).toBe(410);
    expect((await verifyRoute(fakeEvent({ body: { token: second } }))).status).toBe(200);
  });
});

describe('password reset', () => {
  it('does not reveal whether the e-mail has an account', async () => {
    const res = await resetRequest(fakeEvent({ body: { email: `nobody-${uniq()}@example.test` } }));
    expect(res.status).toBe(200);
    expect(mail.sent).toHaveLength(0);
  });

  it('sets a new password once, logs in and ends older sessions', async () => {
    const m = await makeManager('reset');
    created.push(m.household);
    await resetRequest(fakeEvent({ body: { email: m.email } }));
    const token = mail.token(m.email, '/ucet/nove-heslo');
    const cookies = fakeCookies();
    const res = await resetRoute(fakeEvent({ body: { token, password: 'uplne-nove-heslo' }, cookies }));
    expect(res.status).toBe(200);
    const after = (await getAccount(m.account.id))!;
    expect(after.session_version).toBe(m.account.session_version + 1);
    expect(readSessionToken(cookies.jar.get(COOKIE_NAME)!.value)!.sessionVersion).toBe(after.session_version);
    await expect(loginRoute(fakeEvent({ body: { email: m.email, password: 'uplne-nove-heslo' } }))).resolves.toBeDefined();
    expect((await httpError(() => loginRoute(fakeEvent({ body: { email: m.email, password: m.password } })))).status).toBe(401);
    expect((await httpError(() => resetRoute(fakeEvent({ body: { token, password: 'jeste-jine-heslo' } })))).status).toBe(410);
  });

  it('refuses an expired reset link and a short password', async () => {
    const m = await makeManager('reset2');
    created.push(m.household);
    await resetRequest(fakeEvent({ body: { email: m.email } }));
    const token = mail.token(m.email, '/ucet/nove-heslo');
    expect((await httpError(() => resetRoute(fakeEvent({ body: { token, password: 'kratke' } })))).status).toBe(400);
    await query(`UPDATE account_tokens SET expires_at = now() - interval '1 second' WHERE account_id = $1`, [m.account.id]);
    expect((await httpError(() => resetRoute(fakeEvent({ body: { token, password: 'uplne-nove-heslo' } })))).status).toBe(410);
  });
});

describe('invites', () => {
  it('lets a verified manager invite another adult who then manages the same household', async () => {
    const m = await makeManager('invite');
    created.push(m.household);
    const guest = `guest-${uniq()}@example.test`;
    const res = await inviteRoute(fakeEvent({ household: m.household, account: m.account, body: { email: guest } }));
    expect(res.status).toBe(201);
    const token = mail.token(guest, '/pozvanka');
    const info = await (await inviteInfoRoute(fakeEvent({ url: `http://localhost/api/invites/accept?token=${token}` }))).json();
    expect(info).toEqual({ email: guest, household_name: m.household.name, account_exists: false });
    const cookies = fakeCookies();
    const accepted = await (await acceptRoute(fakeEvent({ body: { token, password: 'heslo-hosta-12', accept_terms: true }, cookies }))).json();
    expect(accepted.household.id).toBe(m.household.id);
    expect(accepted.account).toMatchObject({ email: guest, email_verified: true });
    expect((await httpError(() => acceptRoute(fakeEvent({ body: { token, password: 'heslo-hosta-12', accept_terms: true } })))).status).toBe(410);
  });

  it('is only for managers with a verified e-mail and not for PIN devices', async () => {
    const m = await makeManager('invite-unverified', { verified: false });
    created.push(m.household);
    expect((await httpError(() => inviteRoute(fakeEvent({ household: m.household, account: m.account, body: { email: `x-${uniq()}@example.test` } })))).status).toBe(403);
    expect((await httpError(() => inviteRoute(fakeEvent({ household: m.household, body: { email: `x-${uniq()}@example.test` } })))).status).toBe(403);
  });
});

describe('„Doplnit účet“ for a household from before accounts', () => {
  it('adds the first account to a PIN household, then refuses a second claim', async () => {
    const household = await createHousehold(`Test claim ${uniq()}`, await hashPin('1234'));
    created.push(household);
    const email = `claim-${uniq()}@example.test`;
    const res = await claimRoute(fakeEvent({ household, body: { email, password: PASSWORD, accept_terms: true } }));
    expect(res.status).toBe(201);
    expect(mail.token(email, '/ucet/overeni')).toBeTruthy();
    const again = await httpError(() => claimRoute(fakeEvent({ household, body: { email: `other-${uniq()}@example.test`, password: PASSWORD, accept_terms: true } })));
    expect(again.status).toBe(409);
  });
});

describe('household settings and own account', () => {
  it('sets the PIN only as a manager', async () => {
    const m = await makeManager('settings');
    created.push(m.household);
    await patchHousehold(fakeEvent({ method: 'PATCH', household: m.household, account: m.account, body: { pin: '4321' } }));
    expect((await one<{ pin_hash: string | null }>('SELECT pin_hash FROM households WHERE id = $1', [m.household.id]))!.pin_hash).toMatch(/^scrypt/);
    expect((await httpError(() => patchHousehold(fakeEvent({ method: 'PATCH', household: m.household, body: { pin: '0000' } })))).status).toBe(403);
  });

  it('refuses to delete the last manager account', async () => {
    const m = await makeManager('last');
    created.push(m.household);
    const err = await httpError(() => deleteAccountRoute(fakeEvent({ method: 'DELETE', household: m.household, account: m.account, body: { password: m.password } })));
    expect(err.status).toBe(409);
  });
});

describe('purge of unverified accounts', () => {
  it('removes accounts unverified for 30 days with their household, keeps verified and pre-account households', async () => {
    const stale = await makeManager('stale', { verified: false });
    const fresh = await makeManager('fresh', { verified: false });
    const verified = await makeManager('verified');
    const legacy = await createHousehold(`Test legacy-purge ${uniq()}`, await hashPin('1111'));
    created.push(fresh.household, verified.household, legacy);
    await query(`UPDATE accounts SET created_at = now() - interval '31 days' WHERE id = ANY($1::bigint[])`, [[stale.account.id, verified.account.id]]);
    const result = await purgeUnverified();
    expect(result.accounts).toBeGreaterThanOrEqual(1);
    expect(await getHousehold(stale.household.id)).toBeNull();
    expect(await getAccount(stale.account.id)).toBeNull();
    expect(await getAccount(fresh.account.id)).not.toBeNull();
    expect(await getAccount(verified.account.id)).not.toBeNull();
    expect(await getHousehold(legacy.id)).not.toBeNull();
  });
});
