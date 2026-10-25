// Chess game state over chess.js: plain JSON (start FEN + move list), so it can live in
// localStorage, travel over a WebSocket or be replayed on the server. chess.js decides legality;
// the reducer adds players, an optional clock, draw offers, resignation and the result in Czech.

import { Chess, type Color, type Square } from 'chess.js';
import type { Level } from '../../types.ts';
import type { MatchParticipant, MatchResult } from '../../league/types.ts';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type ChessColor = Color;
export type ChessMode = 'ai' | 'local' | 'room';

export interface ChessPlayer {
  /** Profile id (`p12` in DB rooms, local profile id on the tablet, `ai` for the computer). */
  id: string;
  name: string;
  avatar?: string;
  level?: Level;
  /** Computer opponent strength 1–6; absent for a human. */
  aiLevel?: number;
}

export interface ChessMove {
  san: string;
  uci: string;
  /** Epoch ms when the move was played (0 when unknown). */
  at: number;
}

export interface ChessClock {
  initialMs: number;
  incrementMs: number;
  remaining: Record<ChessColor, number>;
  /** Epoch ms when the side to move started thinking; null = clock paused / not started. */
  runningSince: number | null;
}

export type ResultReason = 'checkmate' | 'stalemate' | 'resign' | 'agreement' | 'repetition' | 'fifty' | 'insufficient' | 'timeout';

export interface ChessResult {
  /** null = draw */
  winner: ChessColor | null;
  reason: ResultReason;
  /** Czech sentence for the end screen. */
  text: string;
  at: number;
}

export interface ChessState {
  v: 1;
  id: string;
  mode: ChessMode;
  createdAt: string;
  startFen: string;
  /** Position after the last move (derived, kept for cheap rendering). */
  fen: string;
  moves: ChessMove[];
  players: Record<ChessColor, ChessPlayer>;
  /** Takebacks allowed (games against the computer, learning). Never in league or room games. */
  allowUndo: boolean;
  clock: ChessClock | null;
  drawOffer: ChessColor | null;
  result: ChessResult | null;
}

export type ChessAction =
  | { type: 'move'; move: string | { from: string; to: string; promotion?: string }; by?: ChessColor; now?: number }
  | { type: 'undo'; by?: ChessColor; now?: number }
  | { type: 'resign'; by: ChessColor; now?: number }
  | { type: 'offerDraw'; by: ChessColor; now?: number }
  | { type: 'acceptDraw'; by: ChessColor; now?: number }
  | { type: 'declineDraw'; by: ChessColor; now?: number }
  | { type: 'timeout'; now: number };

export type ChessError = 'finished' | 'illegal' | 'not-your-turn' | 'undo-not-allowed' | 'nothing-to-undo' | 'no-offer' | 'not-timed-out' | 'own-offer';

export type ChessApplyResult = { ok: true; state: ChessState } | { ok: false; error: ChessError };

export const COLOR_LABEL: Record<ChessColor, string> = { w: 'Bílý', b: 'Černý' };

export interface CreateChessInput {
  id?: string;
  mode: ChessMode;
  white: ChessPlayer;
  black: ChessPlayer;
  startFen?: string;
  allowUndo?: boolean;
  /** Minutes per player; null/0 = no clock. */
  clock?: { minutes: number; incrementSeconds?: number } | null;
  createdAt?: string;
}

export function createChessGame(input: CreateChessInput): ChessState {
  const startFen = input.startFen ?? START_FEN;
  new Chess(startFen); // throws on an invalid FEN
  const minutes = input.clock?.minutes ?? 0;
  const initialMs = Math.round(minutes * 60_000);
  return {
    v: 1,
    id: input.id ?? `chess-${Date.now().toString(36)}`,
    mode: input.mode,
    createdAt: input.createdAt ?? new Date().toISOString(),
    startFen,
    fen: startFen,
    moves: [],
    players: { w: input.white, b: input.black },
    allowUndo: input.allowUndo ?? input.mode === 'ai',
    clock: initialMs > 0 ? { initialMs, incrementMs: Math.round((input.clock?.incrementSeconds ?? 0) * 1000), remaining: { w: initialMs, b: initialMs }, runningSince: null } : null,
    drawOffer: null,
    result: null,
  };
}

/** chess.js instance with the whole game replayed (repetition detection needs the history). */
export function replay(state: Pick<ChessState, 'startFen' | 'moves'>): Chess {
  const chess = new Chess(state.startFen);
  for (const m of state.moves) chess.move(uciToMove(m.uci));
  return chess;
}

export function uciToMove(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length > 4 ? { promotion: uci[4] } : {}) };
}

export function turnOf(state: Pick<ChessState, 'fen'>): ChessColor {
  return state.fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

const other = (c: ChessColor): ChessColor => (c === 'w' ? 'b' : 'w');

function winText(winner: ChessColor, reason: 'checkmate' | 'resign' | 'timeout', players: ChessState['players']): string {
  const name = players[winner].name;
  const loser = players[other(winner)].name;
  if (reason === 'checkmate') return `Mat! Vyhrává ${name}.`;
  if (reason === 'resign') return `${loser} se vzdal(a). Vyhrává ${name}.`;
  return `${loser} došel čas. Vyhrává ${name}.`;
}

const DRAW_TEXT: Record<Exclude<ResultReason, 'checkmate' | 'resign' | 'timeout'>, string> = {
  stalemate: 'Pat — hráč na tahu nemá žádný tah, ale není v šachu. Remíza.',
  agreement: 'Remíza dohodou.',
  repetition: 'Remíza — stejná pozice se opakovala třikrát.',
  fifty: 'Remíza — 50 tahů bez braní a bez tahu pěšcem.',
  insufficient: 'Remíza — nikdo už nemá dost figur na mat.',
};

function drawResult(reason: keyof typeof DRAW_TEXT, at: number): ChessResult {
  return { winner: null, reason, text: DRAW_TEXT[reason], at };
}

/** Result of the position after the last move, or null while the game goes on. */
export function detectResult(chess: Chess, players: ChessState['players'], at: number): ChessResult | null {
  if (chess.isCheckmate()) {
    const winner = other(chess.turn());
    return { winner, reason: 'checkmate', text: winText(winner, 'checkmate', players), at };
  }
  if (chess.isStalemate()) return drawResult('stalemate', at);
  if (chess.isInsufficientMaterial()) return drawResult('insufficient', at);
  if (chess.isThreefoldRepetition()) return drawResult('repetition', at);
  if (chess.isDrawByFiftyMoves()) return drawResult('fifty', at);
  return null;
}

/** Only a bare king (or nothing able to mate) left: losing on time is then a draw. */
function cannotMate(chess: Chess, color: ChessColor): boolean {
  let minors = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color || sq.type === 'k') continue;
      if (sq.type === 'p' || sq.type === 'r' || sq.type === 'q') return false;
      minors++;
    }
  }
  return minors <= 1;
}

/** Remaining time of `color` at `now` (the running side's clock keeps ticking). */
export function remainingMs(state: ChessState, color: ChessColor, now: number): number | null {
  const c = state.clock;
  if (!c) return null;
  const running = c.runningSince !== null && !state.result && turnOf(state) === color;
  return Math.max(0, c.remaining[color] - (running ? now - (c.runningSince ?? now) : 0));
}

/** Epoch ms at which the side to move runs out of time; null when no clock runs. */
export function flagAt(state: ChessState): number | null {
  const c = state.clock;
  if (!c || c.runningSince === null || state.result) return null;
  return c.runningSince + c.remaining[turnOf(state)];
}

function stopClock(state: ChessState, now: number): ChessClock | null {
  const c = state.clock;
  if (!c || c.runningSince === null) return c;
  const t = turnOf(state);
  return { ...c, remaining: { ...c.remaining, [t]: Math.max(0, c.remaining[t] - (now - c.runningSince)) }, runningSince: null };
}

export function applyChess(state: ChessState, action: ChessAction): ChessApplyResult {
  const now = action.now ?? Date.now();
  if (action.type === 'timeout') {
    if (state.result) return { ok: false, error: 'finished' };
    const at = flagAt(state);
    if (at === null || now < at) return { ok: false, error: 'not-timed-out' };
    const loser = turnOf(state);
    const winner = other(loser);
    const chess = replay(state);
    const clock = { ...(state.clock as ChessClock), remaining: { ...(state.clock as ChessClock).remaining, [loser]: 0 }, runningSince: null };
    const result: ChessResult = cannotMate(chess, winner)
      ? { winner: null, reason: 'timeout', text: `${state.players[loser].name} došel čas, ale soupeř už nemůže dát mat. Remíza.`, at: now }
      : { winner, reason: 'timeout', text: winText(winner, 'timeout', state.players), at: now };
    return { ok: true, state: { ...state, clock, drawOffer: null, result } };
  }

  if (action.type === 'undo') {
    if (!state.allowUndo) return { ok: false, error: 'undo-not-allowed' };
    if (!state.moves.length) return { ok: false, error: 'nothing-to-undo' };
    // Against the computer one takeback returns to the human's turn (two half-moves).
    let count = 1;
    if (state.mode === 'ai') {
      const human: ChessColor | null = state.players.w.aiLevel ? 'b' : state.players.b.aiLevel ? 'w' : null;
      const afterOne = state.moves.length - 1;
      const startTurn = turnOf({ fen: state.startFen });
      const turnAfterOne = afterOne % 2 === 0 ? startTurn : other(startTurn);
      if (human && turnAfterOne !== human && state.moves.length >= 2) count = 2;
    }
    const moves = state.moves.slice(0, state.moves.length - count);
    const chess = replay({ startFen: state.startFen, moves });
    return {
      ok: true,
      state: { ...state, moves, fen: chess.fen(), result: null, drawOffer: null, clock: state.clock ? { ...state.clock, runningSince: state.clock.runningSince === null ? null : now } : null },
    };
  }

  if (state.result) return { ok: false, error: 'finished' };

  if (action.type === 'resign') {
    const winner = other(action.by);
    return { ok: true, state: { ...state, clock: stopClock(state, now), drawOffer: null, result: { winner, reason: 'resign', text: winText(winner, 'resign', state.players), at: now } } };
  }
  if (action.type === 'offerDraw') {
    if (state.drawOffer === action.by) return { ok: true, state };
    if (state.drawOffer) return applyChess(state, { type: 'acceptDraw', by: action.by, now });
    return { ok: true, state: { ...state, drawOffer: action.by } };
  }
  if (action.type === 'acceptDraw') {
    if (!state.drawOffer) return { ok: false, error: 'no-offer' };
    if (state.drawOffer === action.by) return { ok: false, error: 'own-offer' };
    return { ok: true, state: { ...state, clock: stopClock(state, now), drawOffer: null, result: drawResult('agreement', now) } };
  }
  if (action.type === 'declineDraw') {
    if (!state.drawOffer) return { ok: false, error: 'no-offer' };
    return { ok: true, state: { ...state, drawOffer: null } };
  }

  // move
  const turn = turnOf(state);
  if (action.by && action.by !== turn) return { ok: false, error: 'not-your-turn' };
  const flag = flagAt(state);
  if (flag !== null && now >= flag) return applyChess(state, { type: 'timeout', now });
  const chess = replay(state);
  let played;
  try {
    played = chess.move(typeof action.move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(action.move) ? uciToMove(action.move) : action.move);
  } catch {
    return { ok: false, error: 'illegal' };
  }
  const uci = played.from + played.to + (played.promotion ?? '');
  let clock = state.clock;
  if (clock) {
    const spent = clock.runningSince === null ? 0 : now - clock.runningSince;
    clock = {
      ...clock,
      remaining: { ...clock.remaining, [turn]: Math.max(0, clock.remaining[turn] - spent) + (clock.runningSince === null && state.moves.length === 0 ? 0 : clock.incrementMs) },
      runningSince: now,
    };
  }
  const result = detectResult(chess, state.players, now);
  if (result && clock) clock = { ...clock, runningSince: null };
  return {
    ok: true,
    state: {
      ...state,
      fen: chess.fen(),
      moves: [...state.moves, { san: played.san, uci, at: now }],
      clock,
      // A move answers (declines) the opponent's draw offer; one's own offer stays open.
      drawOffer: state.drawOffer === turn ? turn : null,
      result,
    },
  };
}

/** Reducer form: an illegal action leaves the state unchanged. */
export function reduceChess(state: ChessState, action: ChessAction): ChessState {
  const r = applyChess(state, action);
  return r.ok ? r.state : state;
}

// ---------- views used by the UI ----------

export interface LegalMove {
  from: Square;
  to: Square;
  promotion?: string;
  san: string;
  capture: boolean;
}

export function legalMoves(fen: string): LegalMove[] {
  const chess = new Chess(fen);
  return chess.moves({ verbose: true }).map((m) => ({ from: m.from, to: m.to, san: m.san, capture: m.isCapture(), ...(m.promotion ? { promotion: m.promotion } : {}) }));
}

/** Position after one UCI move (throws on an illegal move). */
export function fenAfter(fen: string, uci: string): string {
  const chess = new Chess(fen);
  chess.move(uciToMove(uci));
  return chess.fen();
}

/** Square of the king in check, or null. */
export function checkSquare(fen: string): Square | null {
  const chess = new Chess(fen);
  if (!chess.inCheck()) return null;
  return chess.findPiece({ type: 'k', color: chess.turn() })[0] ?? null;
}

/** Move list paired by move number: [{ n: 1, w: 'e4', b: 'e5' }, …]. */
export function movePairs(state: Pick<ChessState, 'startFen' | 'moves'>): { n: number; w: string | null; b: string | null }[] {
  const parts = state.startFen.split(' ');
  let n = Number(parts[5]) || 1;
  let turn: ChessColor = parts[1] === 'b' ? 'b' : 'w';
  const out: { n: number; w: string | null; b: string | null }[] = [];
  for (const m of state.moves) {
    if (turn === 'w' || !out.length) out.push({ n, w: turn === 'w' ? m.san : null, b: null });
    if (turn === 'b') {
      out[out.length - 1].b = m.san;
      n++;
    }
    turn = other(turn);
  }
  return out;
}

export function pgn(state: ChessState): string {
  const chess = replay(state);
  chess.setHeader('White', state.players.w.name);
  chess.setHeader('Black', state.players.b.name);
  return chess.pgn();
}

// ---------- league ----------

/** MatchResult with gameType 'chess' (the league GameType union does not list chess yet). */
export type ChessMatchResult = Omit<MatchResult, 'gameType'> & { gameType: 'chess' };

/**
 * League result of a finished game: winner place 1 / score 1, loser place 2 / score 0, draw both
 * place 1 / score 0.5. Computer opponents are left out (a game against the computer is not a league match).
 */
export function toMatchResult(state: ChessState, meta: { matchId?: string; playedAt?: string; nightId?: string | null } = {}): ChessMatchResult {
  if (!state.result) throw new Error('[chess] toMatchResult needs a finished game');
  const winner = state.result.winner;
  const participants: MatchParticipant[] = (['w', 'b'] as const)
    .filter((c) => !state.players[c].aiLevel)
    .map((c) => ({
      participantId: state.players[c].id,
      kind: 'player' as const,
      memberIds: [state.players[c].id],
      place: winner === null || winner === c ? 1 : 2,
      score: winner === null ? 0.5 : winner === c ? 1 : 0,
    }));
  return {
    matchId: meta.matchId ?? state.id,
    gameType: 'chess',
    playedAt: meta.playedAt ?? new Date(state.result.at || Date.parse(state.createdAt)).toISOString(),
    nightId: meta.nightId ?? null,
    participants,
  };
}
