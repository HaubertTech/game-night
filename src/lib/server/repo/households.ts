import { one, query, type Queryable } from '../db.ts';

export interface Household {
  id: number;
  name: string;
  created_at: Date;
}

export interface HouseholdWithPin extends Household {
  pin_hash: string | null;
  pin_failed_attempts: number;
  pin_locked_until: Date | null;
}

const COLUMNS = 'id, name, created_at';
const PIN_COLUMNS = `${COLUMNS}, pin_hash, pin_failed_attempts, pin_locked_until`;

export async function countHouseholds(client?: Queryable): Promise<number> {
  const row = await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM households', [], client);
  return row?.n ?? 0;
}

export async function createHousehold(name: string, pinHash: string | null, client?: Queryable): Promise<Household> {
  const row = await one<Household>(
    `INSERT INTO households (name, pin_hash) VALUES ($1, $2) RETURNING ${COLUMNS}`,
    [name, pinHash],
    client,
  );
  return row!;
}

export async function getHousehold(id: number, client?: Queryable): Promise<Household | null> {
  return one<Household>(`SELECT ${COLUMNS} FROM households WHERE id = $1`, [id], client);
}

export async function getHouseholdWithPin(id: number, client?: Queryable): Promise<HouseholdWithPin | null> {
  return one<HouseholdWithPin>(`SELECT ${PIN_COLUMNS} FROM households WHERE id = $1`, [id], client);
}

/**
 * Legacy PIN login by name: only households that have no account yet (created before accounts
 * existed). Once a manager adds e-mail and password, the PIN works only on remembered devices.
 * Without a name: the only such household, if there is exactly one.
 */
export async function findLegacyHouseholdForLogin(name: string | null, client?: Queryable): Promise<HouseholdWithPin | null> {
  const rows = await query<HouseholdWithPin>(
    `SELECT ${PIN_COLUMNS} FROM households h
      WHERE ($1::text IS NULL OR lower(h.name) = lower($1))
        AND h.pin_hash IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.household_id = h.id AND a.deleted_at IS NULL)
      ORDER BY h.id LIMIT 2`,
    [name],
    client,
  );
  return rows.length === 1 ? rows[0] : null;
}

/** Back-compat name for older callers and tests. */
export const findHouseholdForLogin = findLegacyHouseholdForLogin;

export async function hasAccount(householdId: number, client?: Queryable): Promise<boolean> {
  const row = await one('SELECT 1 FROM accounts WHERE household_id = $1 AND deleted_at IS NULL LIMIT 1', [householdId], client);
  return Boolean(row);
}

export async function setHouseholdPin(id: number, pinHash: string | null, client?: Queryable): Promise<void> {
  await query(
    'UPDATE households SET pin_hash = $2, pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = now() WHERE id = $1',
    [id, pinHash],
    client,
  );
}

export async function renameHousehold(id: number, name: string, client?: Queryable): Promise<Household | null> {
  return one<Household>(`UPDATE households SET name = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`, [id, name], client);
}

/** Wrong PIN: counts the failure and locks the PIN for a while after too many in a row. */
export async function recordPinFailure(id: number, opts: { maxAttempts: number; lockMinutes: number }, client?: Queryable): Promise<{ locked_until: Date | null }> {
  const row = await one<{ locked_until: Date | null }>(
    `UPDATE households
        SET pin_failed_attempts = pin_failed_attempts + 1,
            pin_locked_until = CASE WHEN pin_failed_attempts + 1 >= $2
                                    THEN now() + make_interval(mins => $3::int * (1 + (pin_failed_attempts + 1 - $2) / $2))
                                    ELSE pin_locked_until END
      WHERE id = $1
      RETURNING pin_locked_until AS locked_until`,
    [id, opts.maxAttempts, opts.lockMinutes],
    client,
  );
  return { locked_until: row?.locked_until ?? null };
}

export async function recordPinSuccess(id: number, client?: Queryable): Promise<void> {
  await query('UPDATE households SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1 AND (pin_failed_attempts > 0 OR pin_locked_until IS NOT NULL)', [id], client);
}

export async function deleteHousehold(id: number, client?: Queryable): Promise<void> {
  await query('DELETE FROM households WHERE id = $1', [id], client);
}
