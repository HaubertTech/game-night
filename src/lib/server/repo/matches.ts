import type { GameType } from '../../league/types.ts';
import type { Level } from '../../types.ts';
import { one, query, tx, type Queryable } from '../db.ts';

export type { GameType };
export type MatchMode = 'pass' | 'live';
export type MatchStatus = 'lobby' | 'running' | 'finished' | 'abandoned';

export interface Match {
  id: number;
  household_id: number;
  night_id: number | null;
  game_type: GameType;
  mode: MatchMode | null;
  status: MatchStatus;
  state: unknown;
  room_code: string | null;
  legacy_id: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
}

export interface MatchInput {
  game_type: GameType;
  mode?: MatchMode | null;
  night_id?: number | null;
  room_code?: string | null;
  status?: MatchStatus;
  state?: unknown;
  legacy_id?: string | null;
  started_at?: Date | string | null;
}

/** Exactly one of player_id / team_id. */
export interface ParticipantInput {
  player_id?: number | null;
  team_id?: number | null;
  place: number | null;
  score: number;
  league_points?: number;
}

/** Answer of a participant, matched to it by player_id or team_id. */
export interface QuizAnswerInput {
  player_id?: number | null;
  team_id?: number | null;
  question_id: string;
  theme: string;
  level: Level;
  round_no?: number | null;
  correct: boolean;
  points: number;
}

export interface CardRoundInput {
  round_no: number;
  player_id: number;
  points: number;
}

export interface FinishOptions {
  /** Defaults to now(); the import passes the original play time. */
  finished_at?: Date | string | null;
  card_rounds?: CardRoundInput[];
}

export interface Participant {
  id: number;
  match_id: number;
  player_id: number | null;
  team_id: number | null;
  place: number | null;
  score: number;
  league_points: number;
}

const COLUMNS = 'id, household_id, night_id, game_type, mode, status, state, room_code, legacy_id, started_at, finished_at, created_at';

export async function createMatch(householdId: number, input: MatchInput, client?: Queryable): Promise<Match> {
  const row = await one<Match>(
    `INSERT INTO matches (household_id, night_id, game_type, mode, status, state, room_code, legacy_id, started_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'lobby'), $6::jsonb, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      householdId,
      input.night_id ?? null,
      input.game_type,
      input.mode ?? null,
      input.status ?? null,
      input.state === undefined ? null : JSON.stringify(input.state),
      input.room_code ?? null,
      input.legacy_id ?? null,
      input.started_at ?? null,
    ],
    client,
  );
  return row!;
}

export async function getMatch(householdId: number, id: number, client?: Queryable): Promise<Match | null> {
  return one<Match>(`SELECT ${COLUMNS} FROM matches WHERE household_id = $1 AND id = $2`, [householdId, id], client);
}

export async function findMatchByLegacyId(householdId: number, legacyId: string, client?: Queryable): Promise<Match | null> {
  return one<Match>(`SELECT ${COLUMNS} FROM matches WHERE household_id = $1 AND legacy_id = $2`, [householdId, legacyId], client);
}

/** The lobby/running match holding this room code (restores a live room after restart). */
export async function findActiveMatchByRoomCode(roomCode: string, client?: Queryable): Promise<Match | null> {
  return one<Match>(`SELECT ${COLUMNS} FROM matches WHERE room_code = $1 AND status IN ('lobby', 'running')`, [roomCode], client);
}

/** All lobby/running matches (live rooms to restore on server start). */
export async function listActiveMatches(client?: Queryable): Promise<Match[]> {
  return query<Match>(`SELECT ${COLUMNS} FROM matches WHERE status IN ('lobby', 'running') ORDER BY id`, [], client);
}

/** Persists engine state; optionally moves status (lobby → running sets started_at). */
export async function saveMatchState(id: number, state: unknown, status?: MatchStatus, client?: Queryable): Promise<void> {
  await query(
    `UPDATE matches SET state = $2::jsonb, status = COALESCE($3, status),
            started_at = CASE WHEN COALESCE($3, status) = 'running' THEN COALESCE(started_at, now()) ELSE started_at END,
            updated_at = now()
      WHERE id = $1`,
    [id, JSON.stringify(state), status ?? null],
    client,
  );
}

export async function loadMatchState<T = unknown>(id: number, client?: Queryable): Promise<T | null> {
  const row = await one<{ state: T | null }>('SELECT state FROM matches WHERE id = $1', [id], client);
  return row?.state ?? null;
}

export async function abandonMatch(id: number, client?: Queryable): Promise<void> {
  await query(`UPDATE matches SET status = 'abandoned', updated_at = now() WHERE id = $1 AND status <> 'finished'`, [id], client);
}

/**
 * Writes the result of a match in one transaction: participants, quiz answers, card rounds,
 * status `finished`. Calling it again on a finished match throws (results are written once).
 */
export async function finishMatch(
  matchId: number,
  participants: ParticipantInput[],
  answers: QuizAnswerInput[] = [],
  opts: FinishOptions = {},
  client?: Queryable,
): Promise<Participant[]> {
  const run = async (c: Queryable) => {
    const locked = await one<{ status: MatchStatus }>('SELECT status FROM matches WHERE id = $1 FOR UPDATE', [matchId], c);
    if (!locked) throw new Error(`[matches] match ${matchId} not found`);
    if (locked.status === 'finished') throw new Error(`[matches] match ${matchId} is already finished`);

    const saved: Participant[] = [];
    const byKey = new Map<string, Participant>();
    for (const p of participants) {
      if ((p.player_id == null) === (p.team_id == null)) throw new Error('[matches] participant needs exactly one of player_id / team_id');
      const row = await one<Participant>(
        `INSERT INTO match_participants (match_id, player_id, team_id, place, score, league_points)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, match_id, player_id, team_id, place, score, league_points`,
        [matchId, p.player_id ?? null, p.team_id ?? null, p.place, p.score, p.league_points ?? 0],
        c,
      );
      saved.push(row!);
      byKey.set(p.player_id != null ? `p${p.player_id}` : `t${p.team_id}`, row!);
    }

    for (const a of answers) {
      const key = a.player_id != null ? `p${a.player_id}` : `t${a.team_id}`;
      const participant = byKey.get(key);
      if (!participant) throw new Error(`[matches] answer for unknown participant ${key}`);
      await query(
        `INSERT INTO quiz_answers (match_id, participant_id, player_id, question_id, theme, level, round_no, correct, points)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [matchId, participant.id, participant.player_id, a.question_id, a.theme, a.level, a.round_no ?? null, a.correct, a.points],
        c,
      );
    }

    for (const r of opts.card_rounds ?? []) {
      await query('INSERT INTO card_rounds (match_id, round_no, player_id, points) VALUES ($1, $2, $3, $4)', [matchId, r.round_no, r.player_id, r.points], c);
    }

    await query(
      `UPDATE matches SET status = 'finished', finished_at = COALESCE($2::timestamptz, now()),
              started_at = COALESCE(started_at, $2::timestamptz, now()), updated_at = now()
        WHERE id = $1`,
      [matchId, opts.finished_at ?? null],
      c,
    );
    return saved;
  };
  return client ? run(client) : tx(run);
}

export async function listParticipants(matchId: number, client?: Queryable): Promise<Participant[]> {
  return query<Participant>(
    'SELECT id, match_id, player_id, team_id, place, score, league_points FROM match_participants WHERE match_id = $1 ORDER BY place NULLS LAST, id',
    [matchId],
    client,
  );
}
