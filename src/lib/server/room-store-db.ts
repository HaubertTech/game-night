// RoomStore over the `matches` table: one row per live room (game_type = the room's game, mode live),
// `state` JSONB holds the whole StoredRoom. When the game reaches `finished`, the result is
// written once through `recordMatch` (participants, league points, answers, seen, ratings).
//
// Contestant ids in DB-backed rooms are `p<playerId>` for a player and `t<teamId>` for a team.

import { one, query } from './db.ts';
import { adapterFor } from './games/index.ts';
import { parseSeatId } from './games/types.ts';
import { createMatch, saveMatchState, type MatchStatus } from './repo/matches.ts';
import type { RoomStore, StoredRoom } from './rooms.ts';
import type { GameType } from '../league/types.ts';
import { recordMatch } from './services/results.ts';

export { liveRecordInput } from './games/quiz.ts';

/** Rooms untouched for this long are abandoned instead of restored. */
export const STALE_ROOM_MS = 2 * 24 * 60 * 60 * 1000;

export const playerContestantId = (playerId: number) => `p${playerId}`;
export const teamContestantId = (teamId: number) => `t${teamId}`;

export const parseContestantId = parseSeatId;

/** Match status for a room; `finished` is set by recordMatch, never here. */
function statusFor(room: StoredRoom): MatchStatus | undefined {
  const adapter = adapterFor(room.game);
  if (adapter.isLobby(room.state)) return 'lobby';
  if (adapter.isFinished(room.state)) return undefined;
  return 'running';
}

const isFinished = (room: StoredRoom) => adapterFor(room.game).isFinished(room.state);

export type OnFinished = (householdId: number, matchId: number, room: StoredRoom) => Promise<void>;

export const recordLiveResult: OnFinished = async (householdId, matchId, room) => {
  const playedAt = new Date(room.updatedAt || Date.now()).toISOString();
  await recordMatch(householdId, adapterFor(room.game).recordInput(matchId, room.state, playedAt));
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
          game_type: adapterFor(room.game).gameType ?? (room.game as GameType | undefined) ?? 'quiz',
          mode: 'live',
          room_code: room.code,
          night_id: room.meta?.nightId ?? null,
          status: statusFor(room) ?? 'running',
          state: room,
        });
        id = created.id;
        this.households.set(room.code, householdId);
      }
      this.ids.set(room.code, id);
      if (existing) await saveMatchState(id, room, statusFor(room));
    } else {
      await saveMatchState(id, room, statusFor(room));
    }
    if (isFinished(room)) await this.finish(room, id);
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
      if (isFinished(room)) await this.finish(room, row.id);
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
