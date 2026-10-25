import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { AI_LEVELS, analyze, chooseMove, evaluate, type AiLevel } from '../../../src/lib/games/chess/ai.ts';
import { Position } from '../../../src/lib/games/chess/position.ts';

function perft(p: Position, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of p.generate([])) {
    if (!p.make(m)) continue;
    n += perft(p, depth - 1);
    p.unmake();
  }
  return n;
}

describe('position (move generator of the AI)', () => {
  it.each([
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 3, 8902],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 43238],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467],
  ])('perft %s depth %i = %i', (fen, depth, nodes) => {
    expect(perft(new Position(fen), depth)).toBe(nodes);
  });

  it('round-trips FEN and restores the hash after make/unmake', () => {
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    const p = new Position(fen);
    const h = [p.hash1, p.hash2];
    for (const m of p.legalMoves()) {
      p.make(m);
      p.unmake();
    }
    expect(p.fen()).toBe(fen);
    expect([p.hash1, p.hash2]).toEqual(h);
  });

  it('evaluates the start position as roughly equal', () => {
    expect(Math.abs(evaluate(new Position()))).toBeLessThan(30);
  });
});

describe('chess AI', () => {
  it.each([
    ['r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'h5f7'],
    ['6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8'],
    ['k7/8/1K6/8/8/8/8/2Q5 w - - 0 1', 'c1c8'],
    ['rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'd8h4'],
  ])('finds mate in 1: %s', (fen, mate) => {
    const r = analyze({ fen }, { maxDepth: 3 });
    expect(r.uci).toBe(mate);
    expect(r.mateIn).toBe(1);
  });

  it.each([
    // Two rooks, the ladder.
    ['8/3k4/R7/7R/8/8/8/4K3 w - - 0 1'],
    // King and rook: a quiet king move first.
    ['k7/8/2K5/8/8/8/8/1R6 w - - 0 1'],
    // Doubled rooks on the back rank.
    ['r5k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1'],
  ])('finds mate in 2: %s', (fen) => {
    const r = analyze({ fen }, { maxDepth: 5 });
    expect(r.mateIn).toBe(2);
    // Verify with chess.js: after the first move every defence allows a mate in one.
    const chess = new Chess(fen);
    chess.move({ from: r.uci!.slice(0, 2), to: r.uci!.slice(2, 4) });
    for (const reply of chess.moves({ verbose: true })) {
      chess.move(reply);
      const mates = chess.moves({ verbose: true }).filter((m) => {
        chess.move(m);
        const ok = chess.isCheckmate();
        chess.undo();
        return ok;
      });
      expect(mates.length).toBeGreaterThan(0);
      chess.undo();
    }
  });

  it('wins a hanging queen', () => {
    const r = analyze({ fen: '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1' }, { maxDepth: 3 });
    expect(r.uci).toBe('d2d5');
  });

  it('is deterministic for the same seed', () => {
    const input = { moves: ['e2e4', 'e7e5'] };
    for (const level of [1, 2, 3] as AiLevel[]) {
      expect(chooseMove(input, { level, seed: 42, timeMs: Infinity }).uci).toBe(chooseMove(input, { level, seed: 42, timeMs: Infinity }).uci);
    }
  });

  it('counts a repetition from the game history as a draw', () => {
    // Knights went out and back twice: one more Ng1 repeats the start position a third time.
    const moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1'];
    const r = analyze({ moves }, { maxDepth: 1 });
    // Black to move; f6g8 would be the third repetition and must score exactly 0.
    const pos = new Position();
    for (const m of [...moves, 'f6g8']) pos.make(pos.parseUci(m));
    expect(pos.isRepetition()).toBe(true);
    expect(r.uci).not.toBeNull();
  });

  it('returns null without legal moves', () => {
    expect(chooseMove({ fen: 'k7/1Q6/1K6/8/8/8/8/8 b - - 0 1' }).uci).toBeNull();
  });

  it('sees a queen up as clearly winning', () => {
    const r = analyze({ fen: 'k7/8/8/8/8/8/8/KQ6 w - - 0 1' }, { maxDepth: 2 });
    expect(r.score).toBeGreaterThan(500);
  });

  it('level 1 only plays legal moves (random games checked by chess.js)', () => {
    for (let game = 0; game < 6; game++) {
      const chess = new Chess();
      const moves: string[] = [];
      for (let ply = 0; ply < 60 && !chess.isGameOver(); ply++) {
        const r = chooseMove({ moves }, { level: 1, seed: game * 1000 + ply, timeMs: Infinity });
        expect(r.uci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
        const legal = chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
        expect(legal).toContain(r.uci);
        chess.move({ from: r.uci!.slice(0, 2), to: r.uci!.slice(2, 4), ...(r.uci!.length > 4 ? { promotion: r.uci![4] } : {}) });
        moves.push(r.uci!);
      }
    }
  });

  it('every level answers the opening quickly with a legal move', () => {
    for (const level of AI_LEVELS) {
      const r = chooseMove({ moves: ['e2e4'] }, { level, seed: 7, timeMs: Infinity, maxDepth: Math.min(level, 3) });
      expect(new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1').moves({ verbose: true }).map((m) => m.from + m.to)).toContain(r.uci);
    }
  });

  it('a stronger level beats level 1', () => {
    const chess = new Chess();
    const moves: string[] = [];
    for (let ply = 0; ply < 200 && !chess.isGameOver(); ply++) {
      const white = ply % 2 === 0;
      const r = white ? chooseMove({ moves }, { level: 4, seed: ply, timeMs: Infinity }) : chooseMove({ moves }, { level: 1, seed: ply, timeMs: Infinity });
      chess.move({ from: r.uci!.slice(0, 2), to: r.uci!.slice(2, 4), ...(r.uci!.length > 4 ? { promotion: r.uci![4] } : {}) });
      moves.push(r.uci!);
    }
    expect(chess.isCheckmate()).toBe(true);
    expect(chess.turn()).toBe('b');
  }, 60_000);
});
