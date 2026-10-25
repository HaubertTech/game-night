// RoomStore over the `matches` table: one row per live room (game_type quiz, mode live),
// `state` JSONB holds the whole StoredRoom. When the game reaches `finished`, the result is
// written once through `recordMatch` (participants, league points, answers, seen, ratings).
//
// Contestant ids in DB-backed rooms are `p<playerId>` for a player and `t<teamId>` for a team.

import type { LiveState } from '../engine/live.ts';
import { summarizeLive } from '../engine/live.ts';
import { one, query } from './db.ts';
import { createMatch, saveMatchState, type MatchStatus } from './repo/matches.ts';
import type { RoomStore, StoredRoom } from './rooms.ts';
import { recordMatch, type RecordAnswer, type RecordMatchInput, type RecordParticipant } from './services/results.ts';

/** Rooms untouched for this long are abandoned instead of restored. */
export const STALE_ROOM_MS = 2 * 24 * 60 * 60 * 1000;

export const playerContestantId = (playerId: number) => `p${playerId}`;
export const teamContestantId = (teamId: number) => `t${teamId}`;

export function parseContestantId(id: string): { kind: 'player' | 'team'; id: number } | null {
  const m = /^([pt])(\d{1,15})$/.exec(id);
  if (!m) return null;
  return { kind: m[1] === 'p' ? 'player' : 'team', id: Number(m[2]) };
}

/** Match status for a room state; `finished` is set by recordMatch, never here. */
function statusFor(state: LiveState): MatchStatus | undefined {
  if (state.phase === 'lobby') return 'lobby';
  if (state.phase === 'finished') return undefined;
  return 'running';
}

/**
 * Result of a finished live game in the shape of recordMatch. Kicked contestants left the game
 * and are not recorded; places are recomputed among the rest (ties share a place).
 */
export function liveRecordInput(matchId: number, state: LiveState, playedAt: string): RecordMatchInput {
  const kicked = new Set(state.kicked);
  const ranking = summarizeLive(state).ranking.filter((r) => !kicked.has(r.contestant.id));
  const participants: RecordParticipant[] = [];
  let place = 0;
  let prevScore: number | null = null;
  ranking.forEach((r, i) => {
    if (prevScore === null || r.score !== prevScore) place = i + 1;
    prevScore = r.score;
    const parsed = parseContestantId(r.contestant.id);
    if (!parsed) throw new Error(`[room-store-db] contestant id ${r.contestant.id} is not a DB id`);
    const memberIds = r.contestant.memberIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    participants.push({
      participantId: r.contestant.id,
      kind: parsed.kind,
      ...(parsed.kind === 'player' ? { playerId: parsed.id } : { teamId: parsed.id }),
      memberIds: parsed.kind === 'player' ? [parsed.id] : memberIds,
      place,
      score: r.score,
    });
  });
  const seats = new Map(participants.map((p) => [p.participantId, p]));
  const answers: RecordAnswer[] = [];
  for (const a of state.answers) {
    const seat = seats.get(a.contestantId);
    const q = state.questions[a.questionId];
    if (!seat || !q) continue;
    answers.push({
      participantId: seat.participantId,
      ...(seat.kind === 'player' ? { playerId: seat.playerId } : { teamId: seat.teamId }),
      questionId: q.id,
      theme: q.theme,
      level: q.level,
      roundNo: a.round + 1,
      correct: a.correct,
      points: a.points,
    });
  }
  return { matchId, gameType: 'quiz', playedAt, participants, answers };
}

export type OnFinished = (householdId: number, matchId: number, room: StoredRoom) => Promise<void>;

export const recordLiveResult: OnFinished = async (householdId, matchId, room) => {
  const playedAt = new Date(room.updatedAt || Date.now()).toISOString();
  await recordMatch(householdId, liveRecordInput(matchId, room.state, playedAt));
};

export interface DbRoomStoreOptions {
  onFinished?: OnFinished;
  /** Clock for the stale-room cutoff in list(). */
  clock?: () => number;
}

interface Row {
  id: number;
  household_id: number;
  status: MatchStatus;
  state: StoredRoom | null;
}

export class DbRoomStore implements RoomStore {
  private ids = new Map<string, number>();
  private households = new Map<string, number>();
  private recorded = new Set<number>();
  private readonly onFinished: OnFinished;
  private readonly clock: () => number;

  constructor(options: DbRoomStoreOptions = {}) {
    this.onFinished = options.onFinished ?? recordLiveResult;
    this.clock = options.clock ?? Date.now;
  }

  async save(room: StoredRoom): Promise<void> {
    let id = this.ids.get(room.code);
    if (id === undefined) {
      const existing = await this.activeRow(room.code);
      if (existing) {
        id = existing.id;
        this.households.set(room.code, existing.household_id);
      } else {
        const householdId = room.meta?.householdId;
        if (!householdId) throw new Error(`[room-store-db] room ${room.code} has no household (meta.householdId)`);
        const created = await createMatch(householdId, {
          game_type: 'quiz',
          mode: 'live',
          room_code: room.code,
          night_id: room.meta?.nightId ?? null,
          status: statusFor(room.state) ?? 'running',
          state: room,
        });
        id = created.id;
        this.households.set(room.code, householdId);
      }
      this.ids.set(room.code, id);
      if (existing) await saveMatchState(id, room, statusFor(room.state));
    } else {
      await saveMatchState(id, room, statusFor(room.state));
    }
    if (room.state.phase === 'finished') await this.finish(room, id);
  }

  async load(code: string): Promise<StoredRoom | null> {
    const row = await this.activeRow(code);
    if (!row?.state) return null;
    this.ids.set(code, row.id);
    this.households.set(code, row.household_id);
    return row.state;
  }

  /** Active rooms to restore; stale ones are abandoned, finished-but-unrecorded ones recorded. */
  async list(): Promise<StoredRoom[]> {
    const rows = await query<Row>(
      `SELECT id, household_id, status, state FROM matches
        WHERE mode = 'live' AND room_code IS NOT NULL AND status IN ('lobby', 'running') ORDER BY id`,
    );
    const cutoff = this.clock() - STALE_ROOM_MS;
    const out: StoredRoom[] = [];
    for (const row of rows) {
      const room = row.state;
      if (!room?.state || (room.updatedAt ?? 0) < cutoff) {
        await query(`UPDATE matches SET status = 'abandoned', updated_at = now() WHERE id = $1 AND status IN ('lobby', 'running')`, [row.id]);
        continue;
      }
      this.ids.set(room.code, row.id);
      this.households.set(room.code, row.household_id);
      if (room.state.phase === 'finished') await this.finish(room, row.id);
      out.push(room);
    }
    return out;
  }

  /** Match id of a room this store has seen (tests, diagnostics). */
  matchId(code: string): number | undefined {
    return this.ids.get(code);
  }

  private activeRow(code: string): Promise<Row | null> {
    return one<Row>(
      `SELECT id, household_id, status, state FROM matches WHERE room_code = $1 AND status IN ('lobby', 'running')`,
      [code],
    );
  }

  /** Records the result once; a failure is logged and retried on the next save or restart. */
  private async finish(room: StoredRoom, matchId: number): Promise<void> {
    if (this.recorded.has(matchId)) return;
    const householdId = this.households.get(room.code) ?? room.meta?.householdId;
    if (!householdId) return;
    this.recorded.add(matchId);
    try {
      await this.onFinished(householdId, matchId, room);
    } catch (err) {
      this.recorded.delete(matchId);
      console.error('[room-store-db] recording the result failed', { code: room.code, matchId, err: (err as Error).message });
    }
  }
}
