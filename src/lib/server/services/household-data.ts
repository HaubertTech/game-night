// Personal data of a household: export (JSON), erasing a player (anonymized in the results)
// and deleting the whole household with its accounts.

import { one, query, tx, type Queryable } from '../db.ts';

export const ERASED_PLAYER_NAME = 'Smazaný hráč';
export const EXPORT_FORMAT = 'domaci-liga-export/1';

/** Everything stored about the household, every table filtered by the household id. */
export async function exportHousehold(householdId: number, client?: Queryable): Promise<Record<string, unknown>> {
  const q = <T extends object = Record<string, unknown>>(sql: string) => query<T & Record<string, unknown>>(sql, [householdId], client);
  const household = await one('SELECT id, name, created_at, updated_at, (pin_hash IS NOT NULL) AS has_pin FROM households WHERE id = $1', [householdId], client);
  if (!household) return {};
  const [accounts, invites, players, teams, members, seasons, nights, matches, participants, rounds, answers, seen, ratings] = await Promise.all([
    q(`SELECT id, email, email_verified_at, terms_version, terms_accepted_at, last_login_at, created_at FROM accounts WHERE household_id = $1 AND deleted_at IS NULL ORDER BY id`),
    q(`SELECT id, email, created_at, expires_at, accepted_at, revoked_at FROM invites WHERE household_id = $1 ORDER BY id`),
    q(`SELECT id, name, avatar, level, birth_year, archived_at, created_at, updated_at FROM players WHERE household_id = $1 ORDER BY id`),
    q(`SELECT id, name, avatar, archived_at, created_at FROM teams WHERE household_id = $1 ORDER BY id`),
    q(`SELECT m.team_id, m.player_id FROM team_members m JOIN teams t ON t.id = m.team_id WHERE t.household_id = $1 ORDER BY 1, 2`),
    q(`SELECT id, name, starts_on, ends_on, points_table, created_at FROM seasons WHERE household_id = $1 ORDER BY id`),
    q(`SELECT id, season_id, played_on, title, status, created_at FROM game_nights WHERE household_id = $1 ORDER BY id`),
    q(`SELECT id, night_id, game_type, mode, status, state, started_at, finished_at, created_at FROM matches WHERE household_id = $1 ORDER BY id`),
    q(`SELECT p.id, p.match_id, p.player_id, p.team_id, p.place, p.score, p.league_points FROM match_participants p
         JOIN matches m ON m.id = p.match_id WHERE m.household_id = $1 ORDER BY p.id`),
    q(`SELECT r.match_id, r.round_no, r.player_id, r.points FROM card_rounds r JOIN matches m ON m.id = r.match_id WHERE m.household_id = $1 ORDER BY r.id`),
    q(`SELECT a.match_id, a.participant_id, a.player_id, a.question_id, a.theme, a.level, a.round_no, a.correct, a.points, a.created_at
         FROM quiz_answers a JOIN matches m ON m.id = a.match_id WHERE m.household_id = $1 ORDER BY a.id`),
    q(`SELECT s.player_id, s.question_id, s.seen_at FROM seen_questions s JOIN players p ON p.id = s.player_id WHERE p.household_id = $1 ORDER BY 1, 2`),
    q(`SELECT r.player_id, r.game_type, r.mu, r.sigma, r.games, r.updated_at FROM ratings r JOIN players p ON p.id = r.player_id WHERE p.household_id = $1 ORDER BY 1, 2`),
  ]);
  return {
    format: EXPORT_FORMAT,
    exported_at: new Date().toISOString(),
    household,
    accounts,
    invites,
    players,
    teams: teams.map((t) => ({ ...t, member_ids: members.filter((m) => m.team_id === t.id).map((m) => m.player_id) })),
    seasons,
    nights,
    matches,
    match_participants: participants,
    card_rounds: rounds,
    quiz_answers: answers,
    seen_questions: seen,
    ratings,
  };
}

/**
 * Erases a player's personal data and keeps the results: the profile becomes „Smazaný hráč“,
 * archived, without birth year; the name is replaced in team names and in stored game states.
 * Returns false when the player is not in the household.
 */
export async function erasePlayer(householdId: number, playerId: number): Promise<boolean> {
  return tx(async (c) => {
    const player = await one<{ name: string }>('SELECT name FROM players WHERE household_id = $1 AND id = $2 FOR UPDATE', [householdId, playerId], c);
    if (!player) return false;
    const oldName = player.name;
    await query(
      `UPDATE players SET name = $3, avatar = '👤', birth_year = NULL, legacy_id = NULL,
              archived_at = COALESCE(archived_at, now()), updated_at = now()
        WHERE household_id = $1 AND id = $2`,
      [householdId, playerId, ERASED_PLAYER_NAME],
      c,
    );
    if (oldName !== ERASED_PLAYER_NAME) {
      // Team names are often built from member names („Kuba + Máma“).
      await query(
        `UPDATE teams SET name = replace(name, $3, $4), updated_at = now()
          WHERE household_id = $1 AND id IN (SELECT team_id FROM team_members WHERE player_id = $2) AND position($3 in name) > 0`,
        [householdId, playerId, oldName, ERASED_PLAYER_NAME],
        c,
      );
      // Stored engine states carry display names as `"name": "<name>"` (jsonb text form).
      const needle = `"name": ${JSON.stringify(oldName)}`;
      await query(
        `UPDATE matches SET state = replace(state::text, $2, $3)::jsonb, updated_at = now()
          WHERE household_id = $1 AND state IS NOT NULL AND position($2 in state::text) > 0`,
        [householdId, needle, `"name": ${JSON.stringify(ERASED_PLAYER_NAME)}`],
        c,
      );
    }
    await query('DELETE FROM seen_questions WHERE player_id = $1', [playerId], c);
    console.log('[household-data] player erased', { household: householdId, player: playerId });
    return true;
  });
}

/** Deletes the household and everything in it (accounts, players, games — the schema cascades). */
export async function deleteHouseholdCompletely(householdId: number): Promise<void> {
  await query('DELETE FROM households WHERE id = $1', [householdId]);
  console.log('[household-data] household deleted', { household: householdId });
}
