// Recording a finished match: league points, participants, quiz answers, card rounds,
// seen questions and OpenSkill ratings — all in one transaction. Idempotent: a match that is
// already finished is left untouched.

import { DEFAULT_POINTS_TABLE, pointsForPlaces } from '../../league/points.ts';
import { rateMatch, type RatingTable } from '../../league/ratings.ts';
import type { MatchResult, PointsTable } from '../../league/types.ts';
import { LEVELS, type Level } from '../../types.ts';
import { one, query, tx, type Queryable } from '../db.ts';
import { finishMatch, type GameType, type ParticipantInput, type QuizAnswerInput } from '../repo/matches.ts';
import { getRatings, upsertRatings } from '../repo/ratings.ts';
import { addSeen } from '../repo/seen.ts';

export interface RecordParticipant {
  /** Seat id inside the game (engine contestant id, card player id …); links answers to seats. */
  participantId: string;
  kind: 'player' | 'team';
  playerId?: number;
  teamId?: number;
  /** Player ids behind the seat; `[playerId]` (or empty) for a single player. */
  memberIds: number[];
  place: number;
  score: number;
}

export interface RecordAnswer {
  participantId: string;
  playerId?: number;
  teamId?: number;
  questionId: string;
  theme: string;
  level: string;
  roundNo: number;
  correct: boolean;
  points: number;
}

export interface RecordCardRound {
  roundNo: number;
  playerId: number;
  points: number;
}

export interface RecordMatchInput {
  matchId: number;
  gameType: GameType;
  /** ISO timestamp of the end of the match. */
  playedAt: string;
  participants: RecordParticipant[];
  answers?: RecordAnswer[];
  cardRounds?: RecordCardRound[];
}

/** Invalid input (Czech message, safe to show); API routes map it to 400/404. */
export class ResultError extends Error {
  // No parameter property: server.ts runs under Node type stripping, which rejects them.
  readonly status: 400 | 404 | 409;
  constructor(message: string, status: 400 | 404 | 409 = 400) {
    super(message);
    this.status = status;
  }
}

/** `seasons.points_table` is a plain array; places beyond it get the default participation point. */
export function pointsTableFromSeason(raw: unknown): PointsTable {
  if (Array.isArray(raw) && raw.length && raw.every((n) => Number.isInteger(n) && n >= 0)) {
    return { places: raw as number[], participation: DEFAULT_POINTS_TABLE.participation };
  }
  return DEFAULT_POINTS_TABLE;
}

/** Points table of the season the match's evening belongs to, or the default. */
export async function pointsTableForMatch(matchId: number, client?: Queryable): Promise<PointsTable> {
  const row = await one<{ points_table: unknown }>(
    `SELECT s.points_table FROM matches m
       JOIN game_nights n ON n.id = m.night_id
       JOIN seasons s ON s.id = n.season_id
      WHERE m.id = $1`,
    [matchId],
    client,
  );
  return row ? pointsTableFromSeason(row.points_table) : DEFAULT_POINTS_TABLE;
}

function seatMembers(p: RecordParticipant): number[] {
  if (p.memberIds.length) return p.memberIds;
  return p.playerId != null ? [p.playerId] : [];
}

function validate(input: RecordMatchInput): void {
  if (!input.participants.length) throw new ResultError('Partie nemá žádné účastníky.');
  if (Number.isNaN(Date.parse(input.playedAt))) throw new ResultError('Neplatné datum partie.');
  const seats = new Set<string>();
  for (const p of input.participants) {
    if (seats.has(p.participantId)) throw new ResultError(`Účastník je v partii dvakrát: ${p.participantId}`);
    seats.add(p.participantId);
    const isTeam = p.kind === 'team';
    if (isTeam ? p.teamId == null : p.playerId == null) throw new ResultError(`Účastník ${p.participantId} nemá hráče ani tým.`);
    if (!Number.isInteger(p.place) || p.place < 1) throw new ResultError(`Neplatné pořadí účastníka ${p.participantId}.`);
    if (!Number.isFinite(p.score)) throw new ResultError(`Neplatné skóre účastníka ${p.participantId}.`);
    if (isTeam && !p.memberIds.length) throw new ResultError(`Tým ${p.participantId} nemá členy.`);
  }
  for (const a of input.answers ?? []) {
    if (!seats.has(a.participantId)) throw new ResultError(`Odpověď patří neznámému účastníkovi: ${a.participantId}`);
    if (!(LEVELS as readonly string[]).includes(a.level)) throw new ResultError(`Neplatná úroveň otázky: ${a.level}`);
  }
}

/** Throws when some player or team does not belong to the household. */
async function assertOwnership(householdId: number, input: RecordMatchInput, client: Queryable): Promise<void> {
  const playerIds = new Set<number>();
  const teamIds = new Set<number>();
  for (const p of input.participants) {
    seatMembers(p).forEach((id) => playerIds.add(id));
    if (p.playerId != null) playerIds.add(p.playerId);
    if (p.kind === 'team' && p.teamId != null) teamIds.add(p.teamId);
  }
  for (const r of input.cardRounds ?? []) playerIds.add(r.playerId);
  if (playerIds.size) {
    const rows = await query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM players WHERE household_id = $1 AND id = ANY($2::bigint[])',
      [householdId, [...playerIds]],
      client,
    );
    if (rows[0].n !== playerIds.size) throw new ResultError('Někteří hráči do domácnosti nepatří.');
  }
  if (teamIds.size) {
    const rows = await query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM teams WHERE household_id = $1 AND id = ANY($2::bigint[])',
      [householdId, [...teamIds]],
      client,
    );
    if (rows[0].n !== teamIds.size) throw new ResultError('Některé týmy do domácnosti nepatří.');
  }
}

export interface RecordMatchOutcome {
  /** False when the match had already been finished (nothing changed). */
  recorded: boolean;
}

async function run(householdId: number, input: RecordMatchInput, client: Queryable): Promise<RecordMatchOutcome> {
  const match = await one<{ status: string; game_type: GameType }>(
    'SELECT status, game_type FROM matches WHERE id = $1 AND household_id = $2 FOR UPDATE',
    [input.matchId, householdId],
    client,
  );
  if (!match) throw new ResultError('Taková partie neexistuje.', 404);
  if (match.status === 'finished') return { recorded: false };
  if (match.game_type !== input.gameType) throw new ResultError('Typ hry nesouhlasí s partií.', 409);
  validate(input);
  await assertOwnership(householdId, input, client);

  const table = await pointsTableForMatch(input.matchId, client);
  const leaguePoints = pointsForPlaces(
    input.participants.map((p) => p.place),
    table,
  );

  const seatKey = new Map<string, Pick<ParticipantInput, 'player_id' | 'team_id'>>();
  const participants: ParticipantInput[] = input.participants.map((p, i) => {
    const key = p.kind === 'team' ? { team_id: p.teamId! } : { player_id: p.playerId! };
    seatKey.set(p.participantId, key);
    return { ...key, place: p.place, score: p.score, league_points: leaguePoints[i] };
  });
  const answers: QuizAnswerInput[] = (input.answers ?? []).map((a) => ({
    ...seatKey.get(a.participantId)!,
    question_id: a.questionId,
    theme: a.theme,
    level: a.level as Level,
    round_no: a.roundNo,
    correct: a.correct,
    points: a.points,
  }));

  await finishMatch(
    input.matchId,
    participants,
    answers,
    {
      finished_at: input.playedAt,
      card_rounds: (input.cardRounds ?? []).map((r) => ({ round_no: r.roundNo, player_id: r.playerId, points: r.points })),
    },
    client,
  );

  // Every member of the answering seat has seen the question.
  const seen = new Map<number, string[]>();
  const membersBySeat = new Map(input.participants.map((p) => [p.participantId, seatMembers(p)]));
  for (const a of input.answers ?? []) {
    for (const playerId of membersBySeat.get(a.participantId) ?? []) {
      const list = seen.get(playerId) ?? [];
      list.push(a.questionId);
      seen.set(playerId, list);
    }
  }
  for (const [playerId, ids] of seen) await addSeen(playerId, ids, client);

  // Ratings, per game type; every seat is an OpenSkill team.
  const allMembers = [...new Set(input.participants.flatMap(seatMembers))];
  const current = await getRatings(allMembers, input.gameType, client);
  const ratingTable: RatingTable = {};
  const games = new Map<number, number>();
  for (const r of current) {
    ratingTable[String(r.player_id)] = { mu: r.mu, sigma: r.sigma };
    games.set(r.player_id, r.games);
  }
  const result: MatchResult = {
    matchId: String(input.matchId),
    gameType: input.gameType,
    playedAt: input.playedAt,
    nightId: null,
    participants: input.participants.map((p) => ({
      participantId: p.participantId,
      kind: p.kind,
      memberIds: seatMembers(p).map(String),
      place: p.place,
      score: p.score,
    })),
  };
  const { changes } = rateMatch(ratingTable, result);
  await upsertRatings(
    changes.map((c) => ({
      player_id: Number(c.playerId),
      game_type: input.gameType,
      mu: c.after.mu,
      sigma: c.after.sigma,
      games: (games.get(Number(c.playerId)) ?? 0) + 1,
    })),
    client,
  );
  return { recorded: true };
}

/**
 * Writes the result of a finished match. Calling it again on a finished match is a no-op.
 * Pass `client` to join an outer transaction.
 */
export async function recordMatch(householdId: number, input: RecordMatchInput, client?: Queryable): Promise<RecordMatchOutcome> {
  return client ? run(householdId, input, client) : tx((c) => run(householdId, input, c));
}
