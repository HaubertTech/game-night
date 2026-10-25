// Digital žolíky in a live room: people on phones, computers on the server, the TV shows the
// stock, the discard pile and every laid-down combination. The game goes to the league as
// gameType 'zoliky' with its rounds in card_rounds, like the paper score sheet.

import { zolikyAiStep } from '../../games/karty-hra/ai/autoplay.ts';
import { chooseZolikyCommand, suggestMelds } from '../../games/karty-hra/ai/zoliky-ai.ts';
import { zolikySheet } from '../../cards/zoliky.ts';
import {
  applyZoliky,
  createZolikyGame,
  toMatchResult,
  viewFor,
  type ZolikyGameSettings,
  type ZolikyGameState,
} from '../../games/karty-hra/zoliky-engine.ts';
import { PROTOCOL_VERSION } from '../../live/protocol.ts';
import type { TableSeat, ZolikyRoomCommand, ZolikyRoomState, ZolikyRoomView } from '../../live/table-games.ts';
import type { RecordCardRound, RecordMatchInput } from '../services/results.ts';
import { humanParticipants, reschedule, runServerMove, seatOf, viewerSeatHints, type TableOps } from './card-table.ts';
import { parseSeatId, type GameAdapter } from './types.ts';

/** Commands of one žolíky turn are bounded; a stuck turn must not loop forever. */
const MAX_TURN_STEPS = 60;

const ops: TableOps<ZolikyGameState> = {
  turnKey: (t) => `${t.roundIndex}:${t.turnCount}`,
  aiStep: (t, now, level) => zolikyAiStep(t, now, level),
  timeoutStep(t, now) {
    // The beginner computer finishes the person's turn (take a card, lay down what it can, discard).
    const who = t.turn;
    let s = t;
    if (s.step === 'play' && s.snapshot && s.tookDiscard) {
      const back = applyZoliky(s, { type: 'resetTurn', by: { role: 'contestant', contestantId: who }, now });
      if (back.ok) s = back.state;
    }
    for (let i = 0; i < MAX_TURN_STEPS && s.phase === 'playing' && s.turn === who; i++) s = zolikyAiStep(s, now, 1);
    return s;
  },
};

export interface CreateZolikyRoomInput {
  id: string;
  createdAt: string;
  seed: number;
  seats: TableSeat[];
  nightId?: string | null;
  settings?: Partial<ZolikyGameSettings>;
  turnSeconds?: number | null;
  aiDelayMs: number;
  now: number;
}

export function createZolikyRoom(input: CreateZolikyRoomInput): ZolikyRoomState {
  const table = createZolikyGame({
    id: input.id,
    createdAt: input.createdAt,
    seed: input.seed,
    nightId: input.nightId ?? null,
    settings: input.settings,
    players: input.seats.map((s) => ({ id: s.id, name: s.name, ai: s.ai })),
    now: input.now,
  });
  return {
    game: 'zoliky-hra',
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

function hintFor(room: ZolikyRoomState, me: string | null): ZolikyRoomView['hint'] {
  const t = room.table;
  if (!me || !viewerSeatHints(room, me) || !room.started || t.phase !== 'playing' || t.turn !== me) return null;
  try {
    const advice = chooseZolikyCommand(t, me, 3);
    const c = advice.command;
    const cardIds = c.type === 'discard' ? [c.cardId] : c.type === 'meld' ? c.melds.flat() : c.type === 'layOff' || c.type === 'swapJoker' ? c.cardIds : [];
    const melds = t.step === 'play' ? suggestMelds(t, me) : null;
    return { text: advice.reason, cardIds, opening: melds?.opening?.melds ?? null, melds: melds?.plan.melds ?? [] };
  } catch (err) {
    console.warn('[zoliky-hra] hint failed', { err: (err as Error).message });
    return null;
  }
}

export function zolikyRoomView(room: ZolikyRoomState, viewer: Parameters<typeof viewFor>[1]): ZolikyRoomView {
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

export function zolikyRecordInput(matchId: number, room: ZolikyRoomState, playedAt: string): RecordMatchInput {
  const result = toMatchResult(room.table, playedAt);
  const cardRounds: RecordCardRound[] = [];
  zolikySheet(room.table.sheet).rows.forEach((row, i) => {
    for (const [seatId, points] of Object.entries(row.scores)) {
      if (seatOf(room, seatId)?.ai) continue;
      const seat = parseSeatId(seatId);
      if (seat?.kind === 'player') cardRounds.push({ roundNo: i + 1, playerId: seat.id, points });
    }
  });
  return { matchId, gameType: 'zoliky', playedAt, participants: humanParticipants(room, result.participants, 'zoliky-hra'), cardRounds };
}

export const zolikyRoomAdapter: GameAdapter<ZolikyRoomState, ZolikyRoomCommand> = {
  game: 'zoliky-hra',
  gameType: 'zoliky',
  apply(room, command, by, now) {
    if (command.type === 'start') {
      if (by.role !== 'host') return { ok: false, error: 'forbidden' };
      if (room.started) return { ok: false, error: 'wrongPhase' };
      return { ok: true, state: reschedule({ ...room, started: true }, ops, now) };
    }
    if (!room.started) return { ok: false, error: 'wrongPhase' };
    if (by.role === 'contestant' && seatOf(room, by.contestantId)?.ai) return { ok: false, error: 'forbidden' };
    const r = applyZoliky(room.table, { ...command, by, now });
    if (!r.ok) return { ok: false, error: r.error, ...(r.detail ? { message: r.detail } : {}) };
    return { ok: true, state: reschedule({ ...room, table: r.state }, ops, now) };
  },
  message(room, viewer, presence, now) {
    return { v: PROTOCOL_VERSION, type: 'gameState', game: 'zoliky-hra', view: zolikyRoomView(room, viewer), presence, now };
  },
  timeoutAt: (room) => room.nextAt,
  timeout: (room, now) => runServerMove(room, ops, now, 'zoliky-hra'),
  seats: (room) => room.seats.filter((s) => !s.ai).map((s) => ({ id: s.id, joinable: room.table.phase !== 'finished' })),
  kicked: () => [],
  kickTarget: () => null,
  isLobby: (room) => !room.started,
  isFinished: (room) => room.table.phase === 'finished',
  recordInput: zolikyRecordInput,
};
