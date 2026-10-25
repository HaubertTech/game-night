import { one, query, type Queryable } from '../db.ts';

export interface Account {
  id: number;
  household_id: number;
  email: string;
  email_verified_at: Date | null;
  session_version: number;
  created_at: Date;
}

export interface AccountWithPassword extends Account {
  password_hash: string;
}

const COLUMNS = 'id, household_id, email, email_verified_at, session_version, created_at';

export async function createAccount(
  input: { householdId: number; email: string; passwordHash: string; termsVersion: string; verified?: boolean },
  client?: Queryable,
): Promise<Account> {
  const row = await one<Account>(
    `INSERT INTO accounts (household_id, email, password_hash, terms_version, email_verified_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $5::boolean THEN now() END)
     RETURNING ${COLUMNS}`,
    [input.householdId, input.email, input.passwordHash, input.termsVersion, input.verified ?? false],
    client,
  );
  return row!;
}

export async function getAccount(id: number, client?: Queryable): Promise<Account | null> {
  return one<Account>(`SELECT ${COLUMNS} FROM accounts WHERE id = $1 AND deleted_at IS NULL`, [id], client);
}

export async function getAccountWithPassword(id: number, client?: Queryable): Promise<AccountWithPassword | null> {
  return one<AccountWithPassword>(`SELECT ${COLUMNS}, password_hash FROM accounts WHERE id = $1 AND deleted_at IS NULL`, [id], client);
}

export async function findAccountByEmail(email: string, client?: Queryable): Promise<AccountWithPassword | null> {
  return one<AccountWithPassword>(`SELECT ${COLUMNS}, password_hash FROM accounts WHERE lower(email) = lower($1) AND deleted_at IS NULL`, [email], client);
}

export async function listHouseholdAccounts(householdId: number, client?: Queryable): Promise<Account[]> {
  return query<Account>(`SELECT ${COLUMNS} FROM accounts WHERE household_id = $1 AND deleted_at IS NULL ORDER BY id`, [householdId], client);
}

export async function markVerified(id: number, client?: Queryable): Promise<void> {
  await query('UPDATE accounts SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1', [id], client);
}

/** New password; bumps the session version so other logged-in sessions end. */
export async function setPassword(id: number, passwordHash: string, client?: Queryable): Promise<Account | null> {
  return one<Account>(
    `UPDATE accounts SET password_hash = $2, session_version = session_version + 1, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL RETURNING ${COLUMNS}`,
    [id, passwordHash],
    client,
  );
}

export async function touchLogin(id: number, client?: Queryable): Promise<void> {
  await query('UPDATE accounts SET last_login_at = now() WHERE id = $1', [id], client);
}

/** Soft delete with the personal data scrubbed (the row only says „there was a manager“). */
export async function softDeleteAccount(id: number, client?: Queryable): Promise<void> {
  await query(
    `UPDATE accounts SET deleted_at = now(), email = 'deleted-' || id || '@invalid', password_hash = '',
            session_version = session_version + 1, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL`,
    [id],
    client,
  );
  await query('DELETE FROM account_tokens WHERE account_id = $1', [id], client);
}

// ---------- one-time tokens ----------

export type TokenKind = 'verify' | 'reset';

export async function createToken(accountId: number, kind: TokenKind, tokenHash: string, ttlMinutes: number, client?: Queryable): Promise<void> {
  // A new link replaces the older unused ones of the same kind.
  await query('UPDATE account_tokens SET used_at = now() WHERE account_id = $1 AND kind = $2 AND used_at IS NULL', [accountId, kind], client);
  await query(
    `INSERT INTO account_tokens (account_id, kind, token_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))`,
    [accountId, kind, tokenHash, ttlMinutes],
    client,
  );
}

/** Marks the token used and returns its account; null when unknown, used or expired. */
export async function consumeToken(kind: TokenKind, tokenHash: string, client?: Queryable): Promise<number | null> {
  const row = await one<{ account_id: number }>(
    `UPDATE account_tokens t SET used_at = now()
       FROM accounts a
      WHERE t.token_hash = $1 AND t.kind = $2 AND t.used_at IS NULL AND t.expires_at > now()
        AND a.id = t.account_id AND a.deleted_at IS NULL
      RETURNING t.account_id`,
    [tokenHash, kind],
    client,
  );
  return row?.account_id ?? null;
}

// ---------- invites ----------

export interface Invite {
  id: number;
  household_id: number;
  email: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

const INVITE_COLUMNS = 'id, household_id, email, expires_at, accepted_at, revoked_at, created_at';

export async function createInvite(householdId: number, email: string, tokenHash: string, invitedBy: number, ttlDays: number, client?: Queryable): Promise<Invite> {
  // Re-inviting the same address replaces the previous open invite.
  await query(
    'UPDATE invites SET revoked_at = now() WHERE household_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL',
    [householdId, email],
    client,
  );
  const row = await one<Invite>(
    `INSERT INTO invites (household_id, email, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5::int)) RETURNING ${INVITE_COLUMNS}`,
    [householdId, email, tokenHash, invitedBy, ttlDays],
    client,
  );
  return row!;
}

export async function listOpenInvites(householdId: number, client?: Queryable): Promise<Invite[]> {
  return query<Invite>(
    `SELECT ${INVITE_COLUMNS} FROM invites WHERE household_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() ORDER BY id`,
    [householdId],
    client,
  );
}

export async function countOpenInvites(householdId: number, client?: Queryable): Promise<number> {
  return (await listOpenInvites(householdId, client)).length;
}

export async function revokeInvite(householdId: number, id: number, client?: Queryable): Promise<boolean> {
  const rows = await query(
    'UPDATE invites SET revoked_at = now() WHERE household_id = $1 AND id = $2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id',
    [householdId, id],
    client,
  );
  return rows.length > 0;
}

export async function findOpenInvite(tokenHash: string, client?: Queryable): Promise<(Invite & { household_name: string }) | null> {
  return one<Invite & { household_name: string }>(
    `SELECT i.id, i.household_id, i.email, i.expires_at, i.accepted_at, i.revoked_at, i.created_at, h.name AS household_name
       FROM invites i JOIN households h ON h.id = i.household_id
      WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()`,
    [tokenHash],
    client,
  );
}

export async function markInviteAccepted(id: number, client?: Queryable): Promise<void> {
  await query('UPDATE invites SET accepted_at = now() WHERE id = $1', [id], client);
}
