// Finished matches and quiz answers of a household, in the plain shapes of src/lib/league.
// Seat ids: a player seat is the player id ("12"), a team seat is "t<teamId>"; memberIds are
// player ids as strings, so every league function works with player ids directly.

import type { AnswerFact, GameType, MatchResult } from '../../league/types.ts';
import type { Level, Theme } from '../../types.ts';
import { query, type Queryable } from '../db.ts';

export interface MatchFilter {
  nightId?: number;
  seasonId?: number;
  gameType?: GameType;
  /** Only matches the player took part in (alone or in a team). */
  playerId?: number;
}

interface Row {
  match_id: number;
  game_type: GameType;
  night_id: number | null;
  finished_at: Date;
  player_id: number | null;
  team_id: number | null;
  place: number | null;
  score: number;
  member_ids: number[] | null;
}

/**
 * A match belongs to a season when its evening does, or — without an evening — when it was
 * finished inside the season period.
 */
const SEASON_CONDITION = `(
  (m.night_id IS NOT NULL AND n.season_id = $SEASON)
  OR (m.night_id IS NULL AND EXISTS (
        SELECT 1 FROM seasons s WHERE s.id = $SEASON AND s.household_id = m.household_id
           AND (m.finished_at AT TIME ZONE 'Europe/Prague')::date BETWEEN s.starts_on AND s.ends_on))
)`;

function whereClause(householdId: number, filter: MatchFilter): { sql: string; params: unknown[] } {
  const params: unknown[] = [householdId];
  const parts = ["m.household_id = $1", "m.status = 'finished'"];
  if (filter.nightId != null) {
    params.push(filter.nightId);
    parts.push(`m.night_id = $${params.length}`);
  }
  if (filter.seasonId != null) {
    params.push(filter.seasonId);
    parts.push(SEASON_CONDITION.replaceAll('$SEASON', `$${params.length}`));
  }
  if (filter.gameType) {
    params.push(filter.gameType);
    parts.push(`m.game_type = $${params.length}`);
  }
  if (filter.playerId != null) {
    params.push(filter.playerId);
    const p = `$${params.length}`;
    parts.push(`EXISTS (SELECT 1 FROM match_participants x LEFT JOIN team_members tm ON tm.team_id = x.team_id
                         WHERE x.match_id = m.id AND (x.player_id = ${p} OR tm.player_id = ${p}))`);
  }
  return { sql: parts.join(' AND '), params };
}

export async function loadMatchResults(householdId: number, filter: MatchFilter = {}, client?: Queryable): Promise<MatchResult[]> {
  const { sql, params } = whereClause(householdId, filter);
  const rows = await query<Row>(
    `SELECT m.id AS match_id, m.game_type, m.night_id, m.finished_at,
            mp.player_id, mp.team_id, mp.place, mp.score,
            (SELECT array_agg(tm.player_id::int ORDER BY tm.player_id) FROM team_members tm WHERE tm.team_id = mp.team_id) AS member_ids
       FROM matches m
       LEFT JOIN game_nights n ON n.id = m.night_id
       JOIN match_participants mp ON mp.match_id = m.id
      WHERE ${sql}
      ORDER BY m.finished_at, m.id, mp.place NULLS LAST, mp.id`,
    params,
    client,
  );
  const byMatch = new Map<number, MatchResult>();
  for (const r of rows) {
    let m = byMatch.get(r.match_id);
    if (!m) {
      m = {
        matchId: String(r.match_id),
        gameType: r.game_type,
        playedAt: r.finished_at.toISOString(),
        nightId: r.night_id === null ? null : String(r.night_id),
        participants: [],
      };
      byMatch.set(r.match_id, m);
    }
    const isTeam = r.team_id !== null;
    m.participants.push({
      participantId: isTeam ? `t${r.team_id}` : String(r.player_id),
      kind: isTeam ? 'team' : 'player',
      memberIds: isTeam ? (r.member_ids ?? []).map(String) : [String(r.player_id)],
      // Unranked imported seats count as last.
      place: r.place ?? 99,
      score: r.score,
    });
  }
  return [...byMatch.values()];
}

interface AnswerRow {
  match_id: number;
  finished_at: Date;
  player_id: number | null;
  team_id: number | null;
  member_ids: number[] | null;
  question_id: string;
  theme: string;
  level: Level;
  correct: boolean;
  points: number;
}

export async function loadAnswerFacts(householdId: number, filter: MatchFilter = {}, client?: Queryable): Promise<AnswerFact[]> {
  const { sql, params } = whereClause(householdId, { ...filter, gameType: 'quiz' });
  const rows = await query<AnswerRow>(
    `SELECT m.id AS match_id, m.finished_at, mp.player_id, mp.team_id, qa.question_id, qa.theme, qa.level, qa.correct, qa.points,
            (SELECT array_agg(tm.player_id::int ORDER BY tm.player_id) FROM team_members tm WHERE tm.team_id = mp.team_id) AS member_ids
       FROM quiz_answers qa
       JOIN matches m ON m.id = qa.match_id
       LEFT JOIN game_nights n ON n.id = m.night_id
       JOIN match_participants mp ON mp.id = qa.participant_id
      WHERE ${sql}
      ORDER BY m.finished_at, m.id, qa.id`,
    params,
    client,
  );
  return rows.map((r, seq) => {
    const isTeam = r.team_id !== null;
    return {
      matchId: String(r.match_id),
      playedAt: r.finished_at.toISOString(),
      participantId: isTeam ? `t${r.team_id}` : String(r.player_id),
      memberIds: isTeam ? (r.member_ids ?? []).map(String) : [String(r.player_id)],
      questionId: r.question_id,
      theme: r.theme as Theme,
      level: r.level,
      correct: r.correct,
      points: r.points,
      seq,
    };
  });
}

/** player id (string) → display name, for tie-breaks and labels. */
export async function playerNames(householdId: number, client?: Queryable): Promise<Record<string, string>> {
  const rows = await query<{ id: number; name: string }>('SELECT id, name FROM players WHERE household_id = $1', [householdId], client);
  return Object.fromEntries(rows.map((r) => [String(r.id), r.name]));
}
