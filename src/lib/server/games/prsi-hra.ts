// Digital prší in a live room: people play on their phones (each sees only their own hand), the TV
// shows the table, computers fill the remaining seats and move on the server after a short pause.
// The finished game goes to the league as gameType 'prsi', like a game written on the paper sheet.

import { prsiAiStep } from '../../games/karty-hra/ai/autoplay.ts';
import { choosePrsiMove } from '../../games/karty-hra/ai/prsi-ai.ts';
import {
  applyPrsi,
  createPrsiGame,
  fallbackMove,
  toMatchResult,
  viewFor,
  type PrsiCommand,
  type PrsiGameState,
  type PrsiSettings,
} from '../../games/karty-hra/prsi-engine.ts';
import { PROTOCOL_VERSION } from '../../live/protocol.ts';
import type { PrsiRoomCommand, PrsiRoomState, PrsiRoomView, TableSeat } from '../../live/table-games.ts';
import type { RecordMatchInput } from '../services/results.ts';
import { humanParticipants, reschedule, runServerMove, viewerSeatHints, type TableOps } from './card-table.ts';
import type { GameAdapter } from './types.ts';

const ops: TableOps<PrsiGameState> = {
  turnKey: (t) => `${t.dealIndex}:${t.turnCount}`,
  aiStep: (t, now, level) => prsiAiStep(t, now, level),
  timeoutStep(t, now) {
    const command: PrsiCommand = fallbackMove(t) === 'stand' ? { type: 'stand' } : { type: 'draw' };
    const r = applyPrsi(t, { ...command, by: { role: 'contestant', contestantId: t.turn }, now });
    if (!r.ok) throw new Error(`fallback refused: ${r.error}`);
    return r.state;
  },
};

export interface CreatePrsiRoomInput {
  id: string;
  createdAt: string;
  seed: number;
  seats: TableSeat[];
  nightId?: string | null;
  settings?: Partial<PrsiSettings>;
  turnSeconds?: number | null;
  aiDelayMs: number;
  now: number;
}

export function createPrsiRoom(input: CreatePrsiRoomInput): PrsiRoomState {
  const table = createPrsiGame({
    id: input.id,
    createdAt: input.createdAt,
    seed: input.seed,
    nightId: input.nightId ?? null,
    settings: input.settings,
    players: input.seats.map((s) => ({ id: s.id, name: s.name, ai: s.ai })),
    now: input.now,
  });
  return {
    game: 'prsi-hra',
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

function hintFor(room: PrsiRoomState, me: string | null): PrsiRoomView['hint'] {
  const t = room.table;
  if (!me || !viewerSeatHints(room, me) || !room.started || t.phase !== 'playing' || t.turn !== me) return null;
  const advice = choosePrsiMove(t, me, 3);
  return { text: advice.reason, cardId: advice.move.type === 'play' ? advice.move.cardId : null };
}

export function prsiRoomView(room: PrsiRoomState, viewer: Parameters<typeof viewFor>[1]): PrsiRoomView {
  const me = viewer.role === 'contestant' ? viewer.contestantId : null;
  return {
    ...viewFor(room.table, viewer),
    viewer: viewer.role,
    me,
    roomPhase: room.phase,
    started: room.started,
    seats: room.seats,
    deadline: room.nextKind === 'turn' ? room.nextAt : null,
    turnSeconds: room.turnSeconds,
    hint: hintFor(room, me),
  };
}

export function prsiRecordInput(matchId: number, room: PrsiRoomState, playedAt: string): RecordMatchInput {
  const result = toMatchResult(room.table, playedAt);
  return { matchId, gameType: 'prsi', playedAt, participants: humanParticipants(room, result.participants, 'prsi-hra') };
}

export const prsiRoomAdapter: GameAdapter<PrsiRoomState, PrsiRoomCommand> = {
  game: 'prsi-hra',
  gameType: 'prsi',
  apply(room, command, by, now) {
    if (command.type === 'start') {
      if (by.role !== 'host') return { ok: false, error: 'forbidden' };
      if (room.started) return { ok: false, error: 'wrongPhase' };
      return { ok: true, state: reschedule({ ...room, started: true }, ops, now) };
    }
    if (!room.started) return { ok: false, error: 'wrongPhase' };
    if (by.role === 'contestant' && room.seats.find((s) => s.id === by.contestantId)?.ai) return { ok: false, error: 'forbidden' };
    const r = applyPrsi(room.table, { ...command, by, now });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, state: reschedule({ ...room, table: r.state }, ops, now) };
  },
  message(room, viewer, presence, now) {
    return { v: PROTOCOL_VERSION, type: 'gameState', game: 'prsi-hra', view: prsiRoomView(room, viewer), presence, now };
  },
  timeoutAt: (room) => room.nextAt,
  timeout: (room, now) => runServerMove(room, ops, now, 'prsi-hra'),
  seats: (room) => room.seats.filter((s) => !s.ai).map((s) => ({ id: s.id, joinable: room.table.phase !== 'finished' })),
  kicked: () => [],
  kickTarget: () => null,
  isLobby: (room) => !room.started,
  isFinished: (room) => room.table.phase === 'finished',
  recordInput: prsiRecordInput,
};
