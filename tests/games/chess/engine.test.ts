import { describe, expect, it } from 'vitest';
import {
  START_FEN,
  applyChess,
  createChessGame,
  flagAt,
  legalMoves,
  movePairs,
  reduceChess,
  remainingMs,
  toMatchResult,
  turnOf,
  type ChessAction,
  type ChessState,
} from '../../../src/lib/games/chess/engine.ts';

const T0 = Date.parse('2026-10-25T10:00:00Z');
const tata = { id: 'tata', name: 'Táta', level: 'hospoda' as const };
const ema = { id: 'ema', name: 'Ema', level: 'lavice' as const };

function local(extra: Partial<Parameters<typeof createChessGame>[0]> = {}): ChessState {
  return createChessGame({ id: 'g1', mode: 'local', white: tata, black: ema, createdAt: '2026-10-25T10:00:00Z', ...extra });
}

function play(state: ChessState, moves: string[], start = T0): ChessState {
  let s = state;
  moves.forEach((m, i) => {
    const r = applyChess(s, { type: 'move', move: m, now: start + (i + 1) * 1000 });
    if (!r.ok) throw new Error(`move ${m} failed: ${r.error}`);
    s = r.state;
  });
  return s;
}

describe('chess engine', () => {
  it('starts from the initial position with white to move', () => {
    const s = local();
    expect(s.fen).toBe(START_FEN);
    expect(turnOf(s)).toBe('w');
    expect(legalMoves(s.fen)).toHaveLength(20);
  });

  it('accepts SAN and UCI and records both', () => {
    const s = play(local(), ['e4', 'e7e5']);
    expect(s.moves.map((m) => [m.san, m.uci])).toEqual([
      ['e4', 'e2e4'],
      ['e5', 'e7e5'],
    ]);
    expect(movePairs(s)).toEqual([{ n: 1, w: 'e4', b: 'e5' }]);
  });

  it('rejects illegal moves and moves out of turn', () => {
    const s = local();
    expect(applyChess(s, { type: 'move', move: 'e2e5' })).toEqual({ ok: false, error: 'illegal' });
    expect(applyChess(s, { type: 'move', move: 'e7e5', by: 'b' })).toEqual({ ok: false, error: 'not-your-turn' });
    expect(reduceChess(s, { type: 'move', move: 'Ke2' })).toBe(s);
  });

  it('ends with checkmate (scholar’s mate) and a Czech text', () => {
    const s = play(local(), ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
    expect(s.result).toMatchObject({ winner: 'w', reason: 'checkmate' });
    expect(s.result?.text).toBe('Mat! Vyhrává Táta.');
    expect(applyChess(s, { type: 'move', move: 'Ke7' })).toEqual({ ok: false, error: 'finished' });
  });

  it('detects stalemate', () => {
    const r = play(local({ startFen: 'k7/8/2Q5/8/8/8/8/7K w - - 0 1' }), ['Qb6']);
    expect(r.result).toMatchObject({ winner: null, reason: 'stalemate' });
    expect(r.result?.text).toContain('Pat');
  });

  it('detects insufficient material', () => {
    const s = play(local({ startFen: 'k7/8/8/8/8/8/1q6/K7 w - - 0 1' }), ['Kxb2']);
    expect(s.result).toMatchObject({ winner: null, reason: 'insufficient' });
  });

  it('detects threefold repetition', () => {
    const s = play(local(), ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
    expect(s.result).toMatchObject({ winner: null, reason: 'repetition' });
  });

  it('detects the fifty-move rule', () => {
    const s = play(local({ startFen: 'k7/8/8/8/8/8/8/KR6 w - - 99 80' }), ['Rb2']);
    expect(s.result).toMatchObject({ winner: null, reason: 'fifty' });
  });

  it('resigns', () => {
    const r = applyChess(play(local(), ['e4']), { type: 'resign', by: 'b', now: T0 + 5000 });
    expect(r.ok && r.state.result).toMatchObject({ winner: 'w', reason: 'resign', text: 'Ema se vzdal(a). Vyhrává Táta.' });
  });

  it('draws by agreement only after an offer by the other side', () => {
    const s = play(local(), ['e4']);
    expect(applyChess(s, { type: 'acceptDraw', by: 'b' })).toEqual({ ok: false, error: 'no-offer' });
    const offered = reduceChess(s, { type: 'offerDraw', by: 'b' });
    expect(offered.drawOffer).toBe('b');
    expect(applyChess(offered, { type: 'acceptDraw', by: 'b' })).toEqual({ ok: false, error: 'own-offer' });
    const done = reduceChess(offered, { type: 'acceptDraw', by: 'w' });
    expect(done.result).toMatchObject({ winner: null, reason: 'agreement' });
  });

  it('a move declines the opponent’s draw offer', () => {
    const offered = reduceChess(play(local(), ['e4']), { type: 'offerDraw', by: 'w' });
    expect(reduceChess(offered, { type: 'move', move: 'e5' }).drawOffer).toBeNull();
  });

  describe('undo', () => {
    it('is refused in a two-player game', () => {
      expect(applyChess(play(local(), ['e4']), { type: 'undo' })).toEqual({ ok: false, error: 'undo-not-allowed' });
    });

    it('takes back the computer reply and the own move against the computer', () => {
      const g = createChessGame({ mode: 'ai', white: tata, black: { id: 'ai', name: 'Liška', aiLevel: 3 } });
      expect(g.allowUndo).toBe(true);
      const s = play(g, ['e4', 'e5']);
      const r = applyChess(s, { type: 'undo' });
      expect(r.ok && r.state.moves).toEqual([]);
      expect(r.ok && r.state.fen).toBe(START_FEN);
    });

    it('takes back one move while the computer has not answered yet', () => {
      const g = createChessGame({ mode: 'ai', white: tata, black: { id: 'ai', name: 'Liška', aiLevel: 3 } });
      const r = applyChess(play(g, ['e4']), { type: 'undo' });
      expect(r.ok && r.state.moves).toEqual([]);
    });

    it('reopens a finished game', () => {
      const g = createChessGame({ mode: 'ai', white: tata, black: { id: 'ai', name: 'Liška', aiLevel: 3 } });
      const mated = play(g, ['f3', 'e5', 'g4', 'Qh4#']);
      expect(mated.result?.reason).toBe('checkmate');
      const r = applyChess(mated, { type: 'undo' });
      expect(r.ok && r.state.result).toBeNull();
      expect(r.ok && r.state.moves).toHaveLength(2);
    });
  });

  describe('clock', () => {
    it('starts after white’s first move, adds the increment and flags', () => {
      let s = local({ clock: { minutes: 1, incrementSeconds: 2 } });
      expect(flagAt(s)).toBeNull();
      s = reduceChess(s, { type: 'move', move: 'e4', now: T0 });
      expect(s.clock?.remaining.w).toBe(60_000);
      expect(flagAt(s)).toBe(T0 + 60_000);
      s = reduceChess(s, { type: 'move', move: 'e5', now: T0 + 10_000 });
      expect(s.clock?.remaining.b).toBe(52_000);
      expect(remainingMs(s, 'w', T0 + 15_000)).toBe(55_000);
      expect(applyChess(s, { type: 'timeout', now: T0 + 20_000 })).toEqual({ ok: false, error: 'not-timed-out' });
      const t = reduceChess(s, { type: 'timeout', now: T0 + 70_000 });
      expect(t.result).toMatchObject({ winner: 'b', reason: 'timeout', text: 'Táta došel čas. Vyhrává Ema.' });
    });

    it('a late move loses on time', () => {
      let s = local({ clock: { minutes: 1 } });
      s = reduceChess(s, { type: 'move', move: 'e4', now: T0 });
      const late = reduceChess(s, { type: 'move', move: 'e5', now: T0 + 61_000 });
      expect(late.result).toMatchObject({ winner: 'w', reason: 'timeout' });
      expect(late.moves).toHaveLength(1);
    });

    it('is a draw on time when the opponent has only a king', () => {
      let s = local({ startFen: 'k7/8/8/8/8/8/8/KQ6 w - - 0 1', clock: { minutes: 1 } });
      s = reduceChess(s, { type: 'move', move: 'Qb2', now: T0 });
      s = reduceChess(s, { type: 'move', move: 'Ka7', now: T0 + 1000 });
      const t = reduceChess(s, { type: 'timeout', now: T0 + 1000 + 61_000 });
      expect(t.result).toMatchObject({ winner: null, reason: 'timeout' });
    });
  });

  it('survives a JSON round trip mid-game', () => {
    const s = play(local({ clock: { minutes: 5 } }), ['e4', 'e5', 'Nf3']);
    const copy = JSON.parse(JSON.stringify(s)) as ChessState;
    const a: ChessAction = { type: 'move', move: 'Nc6', now: T0 + 9000 };
    expect(reduceChess(copy, a)).toEqual(reduceChess(s, a));
  });
});

describe('toMatchResult', () => {
  it('gives the winner place 1 and score 1', () => {
    const s = play(local(), ['f3', 'e5', 'g4', 'Qh4#']);
    expect(toMatchResult(s, { matchId: 'm1', nightId: 'n1' })).toEqual({
      matchId: 'm1',
      gameType: 'chess',
      playedAt: new Date(T0 + 4000).toISOString(),
      nightId: 'n1',
      participants: [
        { participantId: 'tata', kind: 'player', memberIds: ['tata'], place: 2, score: 0 },
        { participantId: 'ema', kind: 'player', memberIds: ['ema'], place: 1, score: 1 },
      ],
    });
  });

  it('shares place 1 on a draw', () => {
    const s = reduceChess(reduceChess(play(local(), ['e4']), { type: 'offerDraw', by: 'w' }), { type: 'acceptDraw', by: 'b', now: T0 + 3000 });
    expect(toMatchResult(s).participants.map((p) => [p.place, p.score])).toEqual([
      [1, 0.5],
      [1, 0.5],
    ]);
  });

  it('leaves the computer out', () => {
    const g = createChessGame({ mode: 'ai', white: tata, black: { id: 'ai', name: 'Sova', aiLevel: 6 } });
    const s = reduceChess(g, { type: 'resign', by: 'w', now: T0 });
    expect(toMatchResult(s).participants).toEqual([{ participantId: 'tata', kind: 'player', memberIds: ['tata'], place: 2, score: 0 }]);
  });

  it('refuses an unfinished game', () => {
    expect(() => toMatchResult(local())).toThrow();
  });
});
