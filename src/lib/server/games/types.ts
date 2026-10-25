// Common shape of a game hosted in a live room. RoomManager (rooms.ts) only talks to this
// interface: applying actions, views, server timeouts, seats for phones and the league result.

import type { GameType } from '../../league/types.ts';
import type { RoomGame } from '../../live/games.ts';
import type { ErrorCode, ServerMessage, Viewer } from '../../live/protocol.ts';
import type { RecordMatchInput } from '../services/results.ts';

export type RoomActor = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'system' };

/** `message` replaces the standard Czech text of the error (detailed engine reason). */
export type ApplyResult<S> = { ok: true; state: S } | { ok: false; error: ErrorCode; message?: string };

/** One seat a phone may claim. */
export interface RoomSeat {
  id: string;
  /** A phone may pick this seat right now (not on the TV, game not over). */
  joinable: boolean;
}

export interface GameAdapter<S, C> {
  readonly game: RoomGame;
  /** League game type of the room's match row (defaults to `game`). */
  readonly gameType?: GameType;
  apply(state: S, command: C, by: RoomActor, now: number): ApplyResult<S>;
  /** The message for one screen (state or gameState), without presence/now filled by the caller. */
  message(state: S, viewer: Viewer, presence: Extract<ServerMessage, { type: 'state' }>['presence'], now: number): ServerMessage;
  /** Epoch ms when the server must send `timeout`; null = nothing is timed now. */
  timeoutAt(state: S): number | null;
  /** The `timeout` action at `now`; null when the engine refuses it. */
  timeout(state: S, now: number): S | null;
  seats(state: S): RoomSeat[];
  kicked(state: S): readonly string[];
  /** Contestant removed by this command (its phone is detached), or null. */
  kickTarget(command: C): string | null;
  isLobby(state: S): boolean;
  isFinished(state: S): boolean;
  /** League result of a finished game for recordMatch (DB-backed rooms; contestant ids p<id>/t<id>). */
  recordInput(matchId: number, state: S, playedAt: string): RecordMatchInput;
}

/** `p12` → player 12, `t3` → team 3 (contestant ids of DB-backed rooms). */
export function parseSeatId(id: string): { kind: 'player' | 'team'; id: number } | null {
  const m = /^([pt])(\d{1,15})$/.exec(id);
  if (!m) return null;
  return { kind: m[1] === 'p' ? 'player' : 'team', id: Number(m[2]) };
}

/** Player ids behind seat member ids (`p12` or `12`). */
export function memberPlayerIds(memberIds: readonly string[]): number[] {
  return memberIds
    .map((m) => (m.startsWith('p') ? Number(m.slice(1)) : Number(m)))
    .filter((n) => Number.isInteger(n) && n > 0);
}
