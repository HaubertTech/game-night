// Chess in a live room: two seats (white, black) taken by household players `p<id>` on their
// phones, the TV shows the board, the clocks and the moves. No takebacks; the server ends the game
// on time (`flagAt`) and records it to the league.

import { applyChess, flagAt, toMatchResult, type ChessAction, type ChessColor, type ChessError, type ChessState } from '../../games/chess/engine.ts';
import { PROTOCOL_VERSION, type ErrorCode } from '../../live/protocol.ts';
import type { ChessRoomCommand, ChessRoomView } from '../../live/table-games.ts';
import type { RecordMatchInput, RecordParticipant } from '../services/results.ts';
import { parseSeatId, type GameAdapter, type RoomActor } from './types.ts';

const CHESS_ERRORS: Record<ChessError, ErrorCode> = {
  finished: 'wrongPhase',
  illegal: 'illegalMove',
  'not-your-turn': 'notYourTurn',
  'undo-not-allowed': 'forbidden',
  'nothing-to-undo': 'forbidden',
  'no-offer': 'noOffer',
  'not-timed-out': 'notYet',
  'own-offer': 'ownOffer',
};

/** The side a contestant plays, or null (host, spectator, someone else). */
export function chessColorOf(state: ChessState, by: RoomActor | { role: 'spectator' }): ChessColor | null {
  if (by.role !== 'contestant') return null;
  if (state.players.w.id === by.contestantId) return 'w';
  if (state.players.b.id === by.contestantId) return 'b';
  return null;
}

export function chessPhase(state: ChessState): ChessRoomView['phase'] {
  return state.result ? 'finished' : state.moves.length ? 'playing' : 'lobby';
}

function toAction(command: ChessRoomCommand, by: ChessColor, now: number): ChessAction {
  if (command.type === 'move') return { type: 'move', move: command.uci, by, now };
  return { type: command.type, by, now };
}

export function chessRecordInput(matchId: number, state: ChessState, playedAt: string): RecordMatchInput {
  const result = toMatchResult(state, { playedAt });
  const participants: RecordParticipant[] = result.participants.map((p) => {
    const seat = parseSeatId(p.participantId);
    if (!seat || seat.kind !== 'player') throw new Error(`[chess] seat ${p.participantId} is not a DB player`);
    return { participantId: p.participantId, kind: 'player', playerId: seat.id, memberIds: [seat.id], place: p.place, score: p.score ?? 0 };
  });
  return { matchId, gameType: 'chess', playedAt, participants };
}

export const chessAdapter: GameAdapter<ChessState, ChessRoomCommand> = {
  game: 'chess',
  gameType: 'chess',
  apply(state, command, by, now) {
    const color = chessColorOf(state, by);
    if (!color) return { ok: false, error: 'forbidden' };
    const result = applyChess(state, toAction(command, color, now));
    return result.ok ? { ok: true, state: result.state } : { ok: false, error: CHESS_ERRORS[result.error] };
  },
  message(state, viewer, presence, now) {
    const me = viewer.role === 'contestant' ? viewer.contestantId : null;
    return {
      v: PROTOCOL_VERSION,
      type: 'gameState',
      game: 'chess',
      view: { viewer: viewer.role, phase: chessPhase(state), me, color: chessColorOf(state, viewer), game: state },
      presence,
      now,
    };
  },
  timeoutAt: (state) => flagAt(state),
  timeout(state, now) {
    const result = applyChess(state, { type: 'timeout', now });
    return result.ok ? result.state : null;
  },
  seats: (state) => (['w', 'b'] as const).map((c) => ({ id: state.players[c].id, joinable: !state.result })),
  kicked: () => [],
  kickTarget: () => null,
  isLobby: (state) => state.moves.length === 0 && !state.result,
  isFinished: (state) => state.result !== null,
  recordInput: chessRecordInput,
};
