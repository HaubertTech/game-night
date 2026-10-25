import { one, query, type Queryable } from '../db.ts';

export interface Household {
  id: number;
  name: string;
  created_at: Date;
}

interface HouseholdWithPin extends Household {
  pin_hash: string;
}

const COLUMNS = 'id, name, created_at';

export async function countHouseholds(client?: Queryable): Promise<number> {
  const row = await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM households', [], client);
  return row?.n ?? 0;
}

export async function createHousehold(name: string, pinHash: string, client?: Queryable): Promise<Household> {
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

/** For login: by name (case-insensitive), or the only household when no name is given. */
export async function findHouseholdForLogin(name: string | null, client?: Queryable): Promise<HouseholdWithPin | null> {
  if (name) {
    return one<HouseholdWithPin>(`SELECT ${COLUMNS}, pin_hash FROM households WHERE lower(name) = lower($1)`, [name], client);
  }
  const rows = await query<HouseholdWithPin>(`SELECT ${COLUMNS}, pin_hash FROM households ORDER BY id LIMIT 2`, [], client);
  return rows.length === 1 ? rows[0] : null;
}

export async function deleteHousehold(id: number, client?: Queryable): Promise<void> {
  await query('DELETE FROM households WHERE id = $1', [id], client);
}
