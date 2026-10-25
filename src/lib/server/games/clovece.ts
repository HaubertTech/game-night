// Člověče, nezlob se in a live room: the TV shows the board, each person rolls and picks a pawn on
// their phone (a person without a phone plays on the TV through the host), computers fill the free seats and play on the server after a short pause (the
// same scheduling as the digital card games, card-table.ts). The finished game goes to the league
// as gameType 'clovece' (computers are left out, places stay as at the whole table).

import { adviseClovece, cloveceAiStep } from '../../games/clovece/ai.ts';
import {
  applyClovece,
  createCloveceGame,
  toMatchResult,
  viewFor,
  type CloveceError,
  type CloveceSettings,
  type CloveceState,
} from '../../games/clovece/engine.ts';
import { PROTOCOL_VERSION, type ErrorCode } from '../../live/protocol.ts';
import type { CloveceRoomCommand, CloveceRoomState, CloveceRoomView, TableSeat } from '../../live/table-games.ts';
import type { RecordMatchInput } from '../services/results.ts';
import { humanParticipants, reschedule, runServerMove, viewerSeatHints, type TableOps } from './card-table.ts';
import type { GameAdapter } from './types.ts';

const ERRORS: Record<CloveceError, ErrorCode> = {
  forbidden: 'forbidden',
  wrongPhase: 'wrongPhase',
  notYourTurn: 'notYourTurn',
  rollFirst: 'rollFirst',
  alreadyRolled: 'alreadyRolled',
  illegalMove: 'illegalMove',
};

const ops: TableOps<CloveceState> = {
  // A turn ends when another player is on turn; a six keeps the same turn (and its deadline).
  turnKey: (t) => `${t.turnCount}`,
  aiStep: (t, now, level) => cloveceAiStep(t, now, level),
  // A person's time ran out: the server rolls, or plays the move the beginner computer would.
  timeoutStep: (t, now) => cloveceAiStep(t, now, 1),
};

export interface CreateCloveceRoomInput {
  id: string;
  createdAt: string;
  seed: number;
  seats: TableSeat[];
  nightId?: string | null;
  settings?: Partial<CloveceSettings>;
  turnSeconds?: number | null;
  aiDelayMs: number;
  now: number;
}

export function createCloveceRoom(input: CreateCloveceRoomInput): CloveceRoomState {
  const table = createCloveceGame({
    id: input.id,
    createdAt: input.createdAt,
    seed: input.seed,
    nightId: input.nightId ?? null,
    settings: input.settings,
    players: input.seats.map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, level: s.level, ai: s.ai })),
    now: input.now,
  });
  return {
    game: 'clovece',
    phase: 'lobby',
    table,
    seats: input.seats.map((s) => ({ ...s })),
    started: false,
    turnSeconds: input.turnSeconds ?? null,
    aiDelayMs: input.aiDelayMs,
    nextAt: null,
    nextKind: null,
    turnKey: null,
  };
}

/** The seat on turn when it plays on the TV (the host moves for it), else null. */
function tvSeatOnTurn(room: CloveceRoomState): string | null {
  if (!room.started || room.table.phase !== 'playing') return null;
  const seat = room.seats.find((s) => s.id === room.table.turn);
  return seat?.onTv && !seat.ai ? seat.id : null;
}

function hintFor(room: CloveceRoomState, me: string | null): CloveceRoomView['hint'] {
  const t = room.table;
  if (!me || !viewerSeatHints(room, me) || !room.started || t.phase !== 'playing' || t.turn !== me) return null;
  const advice = adviseClovece(t, 3);
  return { text: advice.reason, pawn: advice.move?.pawn ?? null };
}

export function cloveceRoomView(room: CloveceRoomState, viewer: Parameters<typeof viewFor>[1]): CloveceRoomView {
  const me = viewer.role === 'contestant' ? viewer.contestantId : null;
  // The host gets the owl for a TV seat on its turn, as the phone would.
  const hintSeat = me ?? (viewer.role === 'host' ? tvSeatOnTurn(room) : null);
  return {
    ...viewFor(room.table, viewer),
    viewer: viewer.role,
    me,
    roomPhase: room.phase,
    started: room.started,
    seats: room.seats,
    deadline: room.nextKind === 'turn' ? room.nextAt : null,
    turnSeconds: room.turnSeconds,
    hint: hintFor(room, hintSeat),
  };
}

export function cloveceRecordInput(matchId: number, room: CloveceRoomState, playedAt: string): RecordMatchInput {
  const result = toMatchResult(room.table, playedAt);
  return { matchId, gameType: 'clovece', playedAt, participants: humanParticipants(room, result.participants, 'clovece') };
}

export const cloveceRoomAdapter: GameAdapter<CloveceRoomState, CloveceRoomCommand> = {
  game: 'clovece',
  gameType: 'clovece',
  apply(room, command, by, now) {
    if (command.type === 'start') {
      if (by.role !== 'host') return { ok: false, error: 'forbidden' };
      if (room.started) return { ok: false, error: 'wrongPhase' };
      return { ok: true, state: reschedule({ ...room, started: true }, ops, now) };
    }
    if (!room.started) return { ok: false, error: 'wrongPhase' };
    // People play on their phones, computers on the server; the host only for a seat on the TV.
    let actor = by;
    if (by.role === 'host') {
      const tvSeat = tvSeatOnTurn(room);
      if (!tvSeat) return { ok: false, error: 'forbidden' };
      actor = { role: 'contestant', contestantId: tvSeat };
    } else if (by.role !== 'contestant') return { ok: false, error: 'forbidden' };
    else if (room.seats.find((s) => s.id === by.contestantId)?.ai) return { ok: false, error: 'forbidden' };
    const r = applyClovece(room.table, { ...command, by: actor, now });
    if (!r.ok) return { ok: false, error: ERRORS[r.error] };
    return { ok: true, state: reschedule({ ...room, table: r.state }, ops, now) };
  },
  message(room, viewer, presence, now) {
    return { v: PROTOCOL_VERSION, type: 'gameState', game: 'clovece', view: cloveceRoomView(room, viewer), presence, now };
  },
  timeoutAt: (room) => room.nextAt,
  timeout: (room, now) => runServerMove(room, ops, now, 'clovece'),
  seats: (room) => room.seats.filter((s) => !s.ai).map((s) => ({ id: s.id, joinable: !s.onTv && room.table.phase !== 'finished' })),
  kicked: () => [],
  kickTarget: () => null,
  isLobby: (room) => !room.started,
  isFinished: (room) => room.started && room.table.phase === 'finished',
  recordInput: cloveceRecordInput,
};
