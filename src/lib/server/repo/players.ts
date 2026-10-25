import type { Level } from '../../types.ts';
import { one, query, type Queryable } from '../db.ts';

export interface Player {
  id: number;
  household_id: number;
  name: string;
  avatar: string;
  level: Level;
  birth_year: number | null;
  archived_at: Date | null;
  legacy_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PlayerInput {
  name: string;
  avatar?: string;
  level: Level;
  birth_year?: number | null;
  legacy_id?: string | null;
}

export type PlayerPatch = Partial<Pick<Player, 'name' | 'avatar' | 'level' | 'birth_year'>>;

const COLUMNS = 'id, household_id, name, avatar, level, birth_year, archived_at, legacy_id, created_at, updated_at';

export async function listPlayers(householdId: number, opts: { includeArchived?: boolean } = {}, client?: Queryable): Promise<Player[]> {
  return query<Player>(
    `SELECT ${COLUMNS} FROM players
      WHERE household_id = $1 AND ($2::boolean OR archived_at IS NULL)
      ORDER BY archived_at NULLS FIRST, name, id`,
    [householdId, opts.includeArchived ?? false],
    client,
  );
}

export async function getPlayer(householdId: number, id: number, client?: Queryable): Promise<Player | null> {
  return one<Player>(`SELECT ${COLUMNS} FROM players WHERE household_id = $1 AND id = $2`, [householdId, id], client);
}

export async function findPlayerByLegacyId(householdId: number, legacyId: string, client?: Queryable): Promise<Player | null> {
  return one<Player>(`SELECT ${COLUMNS} FROM players WHERE household_id = $1 AND legacy_id = $2`, [householdId, legacyId], client);
}

export async function createPlayer(householdId: number, input: PlayerInput, client?: Queryable): Promise<Player> {
  const row = await one<Player>(
    `INSERT INTO players (household_id, name, avatar, level, birth_year, legacy_id)
     VALUES ($1, $2, COALESCE($3, '🙂'), $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [householdId, input.name, input.avatar ?? null, input.level, input.birth_year ?? null, input.legacy_id ?? null],
    client,
  );
  return row!;
}

export async function updatePlayer(householdId: number, id: number, patch: PlayerPatch, client?: Queryable): Promise<Player | null> {
  const sets: string[] = [];
  const params: unknown[] = [householdId, id];
  for (const key of ['name', 'avatar', 'level', 'birth_year'] as const) {
    if (patch[key] === undefined) continue;
    params.push(patch[key]);
    sets.push(`${key} = $${params.length}`);
  }
  if (!sets.length) return getPlayer(householdId, id, client);
  return one<Player>(
    `UPDATE players SET ${sets.join(', ')}, updated_at = now()
      WHERE household_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
    params,
    client,
  );
}

/** Archives the player (history and statistics stay). Returns null when not found. */
export async function archivePlayer(householdId: number, id: number, client?: Queryable): Promise<Player | null> {
  return one<Player>(
    `UPDATE players SET archived_at = COALESCE(archived_at, now()), updated_at = now()
      WHERE household_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
    [householdId, id],
    client,
  );
}
