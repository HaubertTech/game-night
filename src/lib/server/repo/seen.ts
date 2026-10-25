import { query, type Queryable } from '../db.ts';

/** Marks questions as seen by the player; repeated ids are ignored. */
export async function addSeen(playerId: number, questionIds: readonly string[], client?: Queryable): Promise<number> {
  const ids = Array.from(new Set(questionIds.filter((q) => typeof q === 'string' && q.length > 0)));
  if (!ids.length) return 0;
  const rows = await query<{ question_id: string }>(
    `INSERT INTO seen_questions (player_id, question_id) SELECT $1, unnest($2::text[])
     ON CONFLICT DO NOTHING RETURNING question_id`,
    [playerId, ids],
    client,
  );
  return rows.length;
}

/** Seen question ids per player id (the `seen` input of `drawGame`, keyed by player id as string). */
export async function loadSeen(playerIds: readonly number[], client?: Queryable): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const id of playerIds) out[String(id)] = [];
  if (!playerIds.length) return out;
  const rows = await query<{ player_id: number; question_id: string }>(
    'SELECT player_id, question_id FROM seen_questions WHERE player_id = ANY($1::bigint[]) ORDER BY seen_at, question_id',
    [playerIds],
    client,
  );
  for (const r of rows) out[String(r.player_id)].push(r.question_id);
  return out;
}

export async function forgetSeen(playerId: number, client?: Queryable): Promise<void> {
  await query('DELETE FROM seen_questions WHERE player_id = $1', [playerId], client);
}
