import { one, query, type Queryable } from '../db.ts';

export interface Team {
  id: number;
  household_id: number;
  name: string;
  avatar: string;
  archived_at: Date | null;
  created_at: Date;
  member_ids: number[];
}

export interface TeamInput {
  name: string;
  avatar?: string;
  member_ids: number[];
}

const SELECT = `SELECT t.id, t.household_id, t.name, t.avatar, t.archived_at, t.created_at,
       COALESCE(array_agg(m.player_id::int ORDER BY m.player_id) FILTER (WHERE m.player_id IS NOT NULL), '{}') AS member_ids
  FROM teams t LEFT JOIN team_members m ON m.team_id = t.id`;

export async function listTeams(householdId: number, opts: { includeArchived?: boolean } = {}, client?: Queryable): Promise<Team[]> {
  return query<Team>(
    `${SELECT} WHERE t.household_id = $1 AND ($2::boolean OR t.archived_at IS NULL)
      GROUP BY t.id ORDER BY t.name, t.id`,
    [householdId, opts.includeArchived ?? false],
    client,
  );
}

export async function getTeam(householdId: number, id: number, client?: Queryable): Promise<Team | null> {
  return one<Team>(`${SELECT} WHERE t.household_id = $1 AND t.id = $2 GROUP BY t.id`, [householdId, id], client);
}

/** Ids from `playerIds` that do not belong to the household. */
export async function foreignPlayerIds(householdId: number, playerIds: number[], client?: Queryable): Promise<number[]> {
  if (!playerIds.length) return [];
  const rows = await query<{ id: number }>('SELECT id FROM players WHERE household_id = $1 AND id = ANY($2::bigint[])', [householdId, playerIds], client);
  const own = new Set(rows.map((r) => r.id));
  return playerIds.filter((id) => !own.has(id));
}

/** Inserts the team and its members. Callers validate that members belong to the household. */
export async function createTeam(householdId: number, input: TeamInput, client?: Queryable): Promise<Team> {
  const team = await one<{ id: number }>(
    `INSERT INTO teams (household_id, name, avatar) VALUES ($1, $2, COALESCE($3, '👥')) RETURNING id`,
    [householdId, input.name, input.avatar ?? null],
    client,
  );
  const members = Array.from(new Set(input.member_ids));
  if (members.length) {
    await query(
      'INSERT INTO team_members (team_id, player_id) SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING',
      [team!.id, members],
      client,
    );
  }
  return (await getTeam(householdId, team!.id, client))!;
}

/** An active team with exactly this name and member set (used by the import to reuse teams). */
export async function findTeamByMembers(householdId: number, name: string, memberIds: number[], client?: Queryable): Promise<Team | null> {
  const sorted = Array.from(new Set(memberIds)).sort((a, b) => a - b);
  const teams = await query<Team>(
    `${SELECT} WHERE t.household_id = $1 AND t.archived_at IS NULL AND t.name = $2 GROUP BY t.id ORDER BY t.id`,
    [householdId, name],
    client,
  );
  return teams.find((t) => t.member_ids.length === sorted.length && t.member_ids.every((id, i) => id === sorted[i])) ?? null;
}

/** An active team with exactly this member set, whatever its name (oldest first). */
export async function findTeamWithMembers(householdId: number, memberIds: number[], client?: Queryable): Promise<Team | null> {
  const sorted = Array.from(new Set(memberIds)).sort((a, b) => a - b);
  const teams = await listTeams(householdId, {}, client);
  return (
    teams
      .slice()
      .sort((a, b) => a.id - b.id)
      .find((t) => t.member_ids.length === sorted.length && t.member_ids.every((id, i) => id === sorted[i])) ?? null
  );
}
