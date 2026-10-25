// Household accounts: registration, login, e-mail verification, password reset, invites of another
// adult manager, the PIN of shared devices, and adding an account to a household created before
// accounts existed („Doplnit účet“). Routes set the cookies; this module owns the rules.

import { TERMS_VERSION } from '../../legal.ts';
import {
  hashOneTimeToken,
  hashPassword,
  hashPin,
  isValidPin,
  newOneTimeToken,
  normalizeEmail,
  passwordProblem,
  verifyPassword,
  verifyPin,
  type SessionClaims,
} from '../auth.ts';
import { tx } from '../db.ts';
import { cleanName, fail } from '../http.ts';
import { sendSafely } from '../mailer.ts';
import {
  consumeToken,
  countOpenInvites,
  createAccount,
  createInvite,
  createToken,
  findAccountByEmail,
  findOpenInvite,
  getAccount,
  getAccountWithPassword,
  listHouseholdAccounts,
  markInviteAccepted,
  markVerified,
  setPassword,
  softDeleteAccount,
  touchLogin,
  type Account,
} from '../repo/accounts.ts';
import {
  createHousehold,
  findLegacyHouseholdForLogin,
  getHousehold,
  getHouseholdWithPin,
  hasAccount,
  recordPinFailure,
  recordPinSuccess,
  setHouseholdPin,
  type Household,
} from '../repo/households.ts';

export const VERIFY_TTL_MINUTES = 48 * 60;
export const RESET_TTL_MINUTES = 60;
export const INVITE_TTL_DAYS = 7;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;
export const MAX_ACCOUNTS_PER_HOUSEHOLD = 4;
export const MAX_OPEN_INVITES = 5;

export interface AuthOutcome {
  household: Household;
  account: Account | null;
  claims: SessionClaims;
}

function claimsFor(household: Household, account: Account | null): SessionClaims {
  return { householdId: household.id, accountId: account?.id ?? null, sessionVersion: account?.session_version ?? 0 };
}

function requireEmail(value: unknown): string {
  const email = normalizeEmail(value);
  if (!email) fail(400, 'Zadej platný e-mail.');
  return email;
}

function requirePassword(value: unknown): string {
  const problem = passwordProblem(value);
  if (problem) fail(400, problem);
  return value as string;
}

function requireConsent(value: unknown): void {
  if (value !== true) fail(400, 'Bez souhlasu s podmínkami a zásadami ochrany údajů účet založit nejde.');
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === '23505';
}

// A wrong e-mail takes as long as a wrong password (no account enumeration by timing).
let dummyHash: Promise<string> | null = null;
async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(password, await dummyHash);
}

// ---------- e-mails ----------

async function sendVerification(account: Pick<Account, 'id' | 'email'>, origin: string): Promise<void> {
  const { token, hash } = newOneTimeToken();
  await createToken(account.id, 'verify', hash, VERIFY_TTL_MINUTES);
  await sendSafely({
    to: account.email,
    subject: 'Herní večer: ověř svůj e-mail',
    text: [
      'Ahoj,',
      '',
      'potvrď prosím, že tahle adresa patří tobě a správci domácnosti v Domácí lize:',
      `${origin}/ucet/overeni?token=${token}`,
      '',
      'Odkaz platí 48 hodin. Neověřený účet se po 30 dnech sám smaže.',
      'Pokud jsi účet nezakládal(a), e-mail ignoruj.',
    ].join('\n'),
  });
}

// ---------- registration and login ----------

export interface RegisterInput {
  email: unknown;
  password: unknown;
  householdName: unknown;
  acceptTerms: unknown;
}

export async function register(input: RegisterInput, origin: string): Promise<AuthOutcome> {
  const email = requireEmail(input.email);
  const password = requirePassword(input.password);
  const name = cleanName(input.householdName, 'Název domácnosti', 60);
  requireConsent(input.acceptTerms);
  const passwordHash = await hashPassword(password);
  let result: { household: Household; account: Account };
  try {
    result = await tx(async (c) => {
      if (await findAccountByEmail(email, c)) fail(409, 'S tímto e-mailem už účet existuje. Přihlas se, nebo si obnov heslo.');
      const household = await createHousehold(name, null, c);
      const account = await createAccount({ householdId: household.id, email, passwordHash, termsVersion: TERMS_VERSION }, c);
      return { household, account };
    });
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'S tímto e-mailem už účet existuje. Přihlas se, nebo si obnov heslo.');
    throw err;
  }
  await sendVerification(result.account, origin);
  console.log('[accounts] household registered', { household: result.household.id, account: result.account.id });
  return { ...result, claims: claimsFor(result.household, result.account) };
}

export async function loginWithPassword(emailRaw: unknown, passwordRaw: unknown): Promise<AuthOutcome> {
  const email = normalizeEmail(emailRaw);
  const password = typeof passwordRaw === 'string' ? passwordRaw : '';
  if (!email || !password || password.length > 200) fail(400, 'Zadej e-mail a heslo.');
  const account = await findAccountByEmail(email);
  if (!account) {
    await burnPasswordCheck(password);
    fail(401, 'Špatný e-mail nebo heslo.');
  }
  if (!(await verifyPassword(password, account.password_hash))) fail(401, 'Špatný e-mail nebo heslo.');
  const household = await getHousehold(account.household_id);
  if (!household) fail(401, 'Špatný e-mail nebo heslo.');
  await touchLogin(account.id);
  const { password_hash: _hash, ...plain } = account;
  return { household, account: plain, claims: claimsFor(household, plain) };
}

/**
 * PIN login. With a device cookie the PIN belongs to that household. Without it only a household
 * that has no account yet (created before accounts existed) can be found by its name.
 */
export async function loginWithPin(pin: unknown, opts: { deviceHouseholdId: number | null; name: string | null }): Promise<AuthOutcome> {
  if (!isValidPin(pin)) fail(400, 'PIN musí mít 4 až 8 číslic.');
  const household = opts.deviceHouseholdId ? await getHouseholdWithPin(opts.deviceHouseholdId) : await findLegacyHouseholdForLogin(opts.name);
  if (!household) {
    if (!opts.deviceHouseholdId && opts.name === null) fail(401, 'Přihlas se e-mailem a heslem. PIN funguje na zařízení, kde už se jednou přihlásil správce.');
    fail(401, 'Špatný PIN.');
  }
  if (!household.pin_hash) fail(409, 'Domácnost zatím nemá PIN. Správce ho nastaví v Nastavení domácnosti.');
  if (household.pin_locked_until && new Date(household.pin_locked_until).getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((new Date(household.pin_locked_until).getTime() - Date.now()) / 60_000));
    fail(423, `PIN je po opakovaných chybách zamčený. Zkus to za ${minutes} min, nebo se přihlas e-mailem a heslem.`);
  }
  if (!(await verifyPin(pin, household.pin_hash))) {
    const { locked_until } = await recordPinFailure(household.id, { maxAttempts: PIN_MAX_ATTEMPTS, lockMinutes: PIN_LOCK_MINUTES });
    if (locked_until && new Date(locked_until).getTime() > Date.now()) {
      console.warn('[accounts] PIN locked', { household: household.id });
      fail(423, `Příliš mnoho chybných PINů. PIN je na ${PIN_LOCK_MINUTES} min zamčený.`);
    }
    fail(401, 'Špatný PIN.');
  }
  await recordPinSuccess(household.id);
  const plain: Household = { id: household.id, name: household.name, created_at: household.created_at };
  return { household: plain, account: null, claims: claimsFor(plain, null) };
}

/** „Doplnit účet“: the first account of a household created before accounts existed. */
export async function claimHousehold(household: Household, input: Omit<RegisterInput, 'householdName'>, origin: string): Promise<AuthOutcome> {
  const email = requireEmail(input.email);
  const password = requirePassword(input.password);
  requireConsent(input.acceptTerms);
  const passwordHash = await hashPassword(password);
  let account: Account;
  try {
    account = await tx(async (c) => {
      await c.query('SELECT id FROM households WHERE id = $1 FOR UPDATE', [household.id]);
      if (await hasAccount(household.id, c)) fail(409, 'Domácnost už účet má. Přihlas se e-mailem a heslem.');
      if (await findAccountByEmail(email, c)) fail(409, 'S tímto e-mailem už účet existuje.');
      return createAccount({ householdId: household.id, email, passwordHash, termsVersion: TERMS_VERSION }, c);
    });
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'S tímto e-mailem už účet existuje.');
    throw err;
  }
  await sendVerification(account, origin);
  console.log('[accounts] legacy household claimed', { household: household.id, account: account.id });
  return { household, account, claims: claimsFor(household, account) };
}

// ---------- verification and password reset ----------

export async function verifyEmail(token: unknown): Promise<Account> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) fail(400, 'Odkaz pro ověření je neplatný.');
  const accountId = await consumeToken('verify', hashOneTimeToken(token));
  if (!accountId) fail(410, 'Odkaz pro ověření je neplatný nebo vypršel. Pošli si nový.');
  await markVerified(accountId);
  return (await getAccount(accountId))!;
}

export async function resendVerification(account: Account, origin: string): Promise<void> {
  if (account.email_verified_at) fail(409, 'E-mail už je ověřený.');
  await sendVerification(account, origin);
}

/** Always succeeds outwardly: whether the address has an account is not revealed. */
export async function requestPasswordReset(emailRaw: unknown, origin: string): Promise<void> {
  const email = requireEmail(emailRaw);
  const account = await findAccountByEmail(email);
  if (!account) return;
  const { token, hash } = newOneTimeToken();
  await createToken(account.id, 'reset', hash, RESET_TTL_MINUTES);
  await sendSafely({
    to: account.email,
    subject: 'Herní večer: nové heslo',
    text: [
      'Ahoj,',
      '',
      'někdo (snad ty) požádal o nové heslo k účtu v Domácí lize. Nové heslo nastavíš tady:',
      `${origin}/ucet/nove-heslo?token=${token}`,
      '',
      'Odkaz platí 60 minut a jde použít jednou. Pokud jsi o nové heslo nežádal(a), e-mail ignoruj — staré heslo dál platí.',
    ].join('\n'),
  });
}

export async function resetPassword(token: unknown, passwordRaw: unknown): Promise<AuthOutcome> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) fail(400, 'Odkaz pro nové heslo je neplatný.');
  const password = requirePassword(passwordRaw);
  const passwordHash = await hashPassword(password);
  const accountId = await consumeToken('reset', hashOneTimeToken(token));
  if (!accountId) fail(410, 'Odkaz pro nové heslo je neplatný nebo vypršel. Požádej o nový.');
  // The link came to the mailbox: that proves the address as well.
  await markVerified(accountId);
  const account = (await setPassword(accountId, passwordHash))!;
  const household = (await getHousehold(account.household_id))!;
  console.log('[accounts] password reset', { account: account.id });
  return { household, account, claims: claimsFor(household, account) };
}

export async function changePassword(account: Account, current: unknown, next: unknown): Promise<AuthOutcome> {
  const withHash = await getAccountWithPassword(account.id);
  if (!withHash || typeof current !== 'string' || !(await verifyPassword(current, withHash.password_hash))) fail(400, 'Současné heslo nesedí.');
  const password = requirePassword(next);
  const updated = (await setPassword(account.id, await hashPassword(password)))!;
  const household = (await getHousehold(updated.household_id))!;
  return { household, account: updated, claims: claimsFor(household, updated) };
}

export async function confirmPassword(account: Account, password: unknown): Promise<void> {
  const withHash = await getAccountWithPassword(account.id);
  if (!withHash || typeof password !== 'string' || !(await verifyPassword(password, withHash.password_hash))) fail(400, 'Heslo nesedí.');
}

// ---------- household settings ----------

export async function setPin(household: Household, pin: unknown): Promise<void> {
  if (pin === null) {
    await setHouseholdPin(household.id, null);
    return;
  }
  if (!isValidPin(pin)) fail(400, 'PIN musí mít 4 až 8 číslic.');
  await setHouseholdPin(household.id, await hashPin(pin));
}

// ---------- invites ----------

export async function inviteManager(household: Household, account: Account, emailRaw: unknown, origin: string): Promise<{ id: number; email: string; expires_at: Date }> {
  if (!account.email_verified_at) fail(403, 'Pozvat dalšího správce můžeš, až ověříš svůj e-mail.');
  const email = requireEmail(emailRaw);
  const accounts = await listHouseholdAccounts(household.id);
  if (accounts.some((a) => a.email === email)) fail(409, 'Tenhle e-mail už je správcem domácnosti.');
  if (accounts.length >= MAX_ACCOUNTS_PER_HOUSEHOLD) fail(409, `Domácnost může mít nejvýš ${MAX_ACCOUNTS_PER_HOUSEHOLD} správce.`);
  if ((await countOpenInvites(household.id)) >= MAX_OPEN_INVITES) fail(409, 'Otevřených pozvánek je moc. Nějakou zruš.');
  const { token, hash } = newOneTimeToken();
  const invite = await createInvite(household.id, email, hash, account.id, INVITE_TTL_DAYS);
  await sendSafely({
    to: email,
    subject: `Herní večer: pozvánka do domácnosti ${household.name}`,
    text: [
      'Ahoj,',
      '',
      `${account.email} tě zve jako dalšího správce domácnosti „${household.name}“ v Domácí lize.`,
      'Účet si založíš tady (zvolíš si heslo):',
      `${origin}/pozvanka?token=${token}`,
      '',
      `Pozvánka platí ${INVITE_TTL_DAYS} dní. Pokud nikoho takového neznáš, e-mail ignoruj.`,
    ].join('\n'),
  });
  return { id: invite.id, email: invite.email, expires_at: invite.expires_at };
}

export async function inviteInfo(token: unknown): Promise<{ email: string; household_name: string; account_exists: boolean }> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) fail(404, 'Pozvánka neexistuje.');
  const invite = await findOpenInvite(hashOneTimeToken(token));
  if (!invite) fail(410, 'Pozvánka je neplatná, vypršela nebo už byla použitá.');
  return { email: invite.email, household_name: invite.household_name, account_exists: Boolean(await findAccountByEmail(invite.email)) };
}

export async function acceptInvite(token: unknown, passwordRaw: unknown, acceptTerms: unknown): Promise<AuthOutcome> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) fail(404, 'Pozvánka neexistuje.');
  const password = requirePassword(passwordRaw);
  requireConsent(acceptTerms);
  const passwordHash = await hashPassword(password);
  try {
    const { household, account } = await tx(async (c) => {
      const invite = await findOpenInvite(hashOneTimeToken(token), c);
      if (!invite) fail(410, 'Pozvánka je neplatná, vypršela nebo už byla použitá.');
      if (await findAccountByEmail(invite.email, c)) fail(409, 'S tímto e-mailem už účet existuje. Jeden e-mail může spravovat jen jednu domácnost.');
      // The link came to the invited mailbox, so the address is verified.
      const account = await createAccount({ householdId: invite.household_id, email: invite.email, passwordHash, termsVersion: TERMS_VERSION, verified: true }, c);
      await markInviteAccepted(invite.id, c);
      return { household: (await getHousehold(invite.household_id, c))!, account };
    });
    console.log('[accounts] invite accepted', { household: household.id, account: account.id });
    return { household, account, claims: claimsFor(household, account) };
  } catch (err) {
    if (isUniqueViolation(err)) fail(409, 'S tímto e-mailem už účet existuje.');
    throw err;
  }
}

// ---------- deletion ----------

/** Deletes the caller's own account; the last manager must delete the whole household instead. */
export async function deleteOwnAccount(account: Account, password: unknown): Promise<void> {
  await confirmPassword(account, password);
  const others = (await listHouseholdAccounts(account.household_id)).filter((a) => a.id !== account.id);
  if (!others.length) fail(409, 'Jsi poslední správce. Smaž celou domácnost, nebo nejdřív pozvi dalšího správce.');
  await softDeleteAccount(account.id);
  console.log('[accounts] account deleted', { account: account.id });
}
