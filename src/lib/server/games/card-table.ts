// Common room logic of the digital card games (prší, žolíky): people on phones, computers on the
// server. After every change the room computes its next server move — a computer move after a
// short pause, or the end of a person's turn when a turn limit is set — and RoomManager runs it
// through the adapter's timeout.

import type { AiLevel } from '../../games/karty-hra/prsi-engine.ts';
import type { CardRoomBase, TableSeat } from '../../live/table-games.ts';
import type { RecordParticipant } from '../services/results.ts';
import { parseSeatId } from './types.ts';

/** Default pause before a computer move (ms); CARD_AI_DELAY_MS overrides it (e2e tests). */
export const DEFAULT_AI_DELAY_MS = 1100;

export interface TableLike {
  phase: string;
  turn: string;
}

export interface TableOps<T extends TableLike> {
  /** Identifies one turn of one player (a žolíky turn has several commands). */
  turnKey(table: T): string;
  aiStep(table: T, now: number, level: AiLevel): T;
  /** A person's turn ran out: the server plays the simplest legal move for them. */
  timeoutStep(table: T, now: number): T;
}

export type CardRoom<T extends TableLike> = CardRoomBase & { table: T; phase: string };

export function seatOf(room: CardRoomBase, id: string): TableSeat | undefined {
  return room.seats.find((s) => s.id === id);
}

/** Room fields that follow from the table: the mirrored phase and the next server move. */
export function reschedule<T extends TableLike, R extends CardRoom<T>>(room: R, ops: TableOps<T>, now: number): R {
  const phase = room.started ? room.table.phase : 'lobby';
  if (!room.started || room.table.phase !== 'playing') return { ...room, phase, nextAt: null, nextKind: null, turnKey: null };
  const seat = seatOf(room, room.table.turn);
  const key = ops.turnKey(room.table);
  if (seat?.ai) return { ...room, phase, nextAt: now + room.aiDelayMs, nextKind: 'ai', turnKey: key };
  if (room.turnSeconds) {
    // A turn keeps its deadline across its own commands (draw, lay down, discard).
    if (room.nextKind === 'turn' && room.turnKey === key && room.nextAt !== null) return { ...room, phase };
    return { ...room, phase, nextAt: now + room.turnSeconds * 1000, nextKind: 'turn', turnKey: key };
  }
  return { ...room, phase, nextAt: null, nextKind: null, turnKey: key };
}

/** Runs the due server move; null when nothing is due or the move failed (logged). */
export function runServerMove<T extends TableLike, R extends CardRoom<T>>(room: R, ops: TableOps<T>, now: number, label: string): R | null {
  if (room.nextAt === null || now < room.nextAt || !room.started || room.table.phase !== 'playing') return null;
  const seat = seatOf(room, room.table.turn);
  try {
    if (room.nextKind === 'ai' && seat?.ai) return reschedule({ ...room, table: ops.aiStep(room.table, now, seat.ai) }, ops, now);
    if (room.nextKind === 'turn' && seat && !seat.ai) return reschedule({ ...room, table: ops.timeoutStep(room.table, now) }, ops, now);
  } catch (err) {
    console.error(`[${label}] server move failed`, { turn: room.table.turn, kind: room.nextKind, err: (err as Error).message });
  }
  return null;
}

/**
 * League seats of the people at the table (computers are left out). Places stay as they were at
 * the whole table, so losing to the computer is not a win.
 */
export function humanParticipants(
  room: CardRoomBase,
  participants: readonly { participantId: string; place: number; score: number | null }[],
  label: string,
): RecordParticipant[] {
  return participants
    .filter((p) => !seatOf(room, p.participantId)?.ai)
    .map((p) => {
      const seat = parseSeatId(p.participantId);
      if (!seat || seat.kind !== 'player') throw new Error(`[${label}] seat ${p.participantId} is not a DB player`);
      return { participantId: p.participantId, kind: 'player', playerId: seat.id, memberIds: [seat.id], place: p.place, score: p.score ?? 0 };
    });
}

export function viewerSeatHints(room: CardRoomBase, me: string | null): boolean {
  return !!me && !!seatOf(room, me)?.hints;
}
