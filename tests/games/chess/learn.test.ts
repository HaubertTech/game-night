import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import lessonsJson from '../../../data/chess/lessons.json';
import puzzlesJson from '../../../data/chess/puzzles.json';
import { scoreMoves } from '../../../src/lib/games/chess/ai.ts';
import {
  applyStepMove,
  isSolo,
  lessonDone,
  loadProgress,
  markPuzzle,
  markStep,
  startStep,
  stepMoves,
  validateLessons,
  type LessonFile,
} from '../../../src/lib/games/chess/learn/lessons.ts';
import {
  PUZZLE_DEPTH,
  UNIQUE_MARGIN,
  WIN_MARGIN,
  checkMaterialPuzzle,
  isSolution,
  matingMoves,
  type PuzzleFile,
} from '../../../src/lib/games/chess/learn/puzzles.ts';
import { blunderText, explainMove, hintProfile, threatenedPieces, threatText } from '../../../src/lib/games/chess/learn/hints.ts';
import { materialBalance } from '../../../src/lib/games/chess/ai.ts';

const lessons = lessonsJson as unknown as LessonFile;
const puzzles = (puzzlesJson as unknown as PuzzleFile).puzzles;

describe('lessons', () => {
  it('are structurally valid', () => {
    expect(validateLessons(lessons)).toEqual([]);
    expect(lessons.lessons.length).toBeGreaterThanOrEqual(15);
  });

  it('cover the required topics', () => {
    const ids = lessons.lessons.map((l) => l.id);
    for (const id of ['pesec', 'vez', 'strelec', 'dama', 'kral', 'jezdec', 'brani', 'sach', 'utek', 'mat-dama', 'mat-veze', 'rosada', 'promena', 'en-passant', 'zahajeni', 'hodnota']) {
      expect(ids).toContain(id);
    }
  });

  const steps = lessons.lessons.flatMap((l) => l.steps.map((s) => ({ lesson: l.id, step: s })));

  it.each(steps.map((s) => [`${s.lesson}/${s.step.id}`, s.step] as const))('%s has a loadable FEN and its solution completes it', (_name, step) => {
    // Positions with both kings must be fully legal chess positions.
    const fen = step.fen;
    if (/k/.test(fen.split(' ')[0]) && /K/.test(fen.split(' ')[0])) expect(() => new Chess(fen)).not.toThrow();
    let state = startStep(step);
    for (const uci of step.solution) {
      expect(stepMoves(state).map((m) => m.from + m.to + (m.promotion ?? ''))).toContain(uci);
      const r = applyStepMove(step, state, uci);
      expect(r.ok, `${uci}: ${r.message}`).toBe(true);
      state = r.state;
    }
    expect(state.done).toBe(true);
  });

  it('a wrong move keeps the step and gives the hint', () => {
    const step = lessons.lessons.find((l) => l.id === 'sach')!.steps[0];
    const r = applyStepMove(step, startStep(step), 'a1a2');
    expect(r.ok).toBe(false);
    expect(r.message).toBe(step.hint);
    expect(r.state.fen).toBe(step.fen);
  });

  it('solo steps keep the same side to move', () => {
    const step = lessons.lessons.find((l) => l.id === 'vez')!.steps[0];
    expect(isSolo(step.goal)).toBe(true);
    const r = applyStepMove(step, startStep(step), 'a1a6');
    expect(r.ok && r.state.fen.split(' ')[1]).toBe('w');
    expect(r.state.left).toEqual(['f6', 'f2']);
    expect(r.message).toContain('Hvězdička');
  });

  it('mate in 2 rejects a move that lets the king escape', () => {
    const step = lessons.lessons.find((l) => l.id === 'mat-veze')!.steps[1];
    const r = applyStepMove(step, startStep(step), 'h5h1');
    expect(r.ok).toBe(false);
  });

  it('progress is stored per player and counts finished steps', () => {
    const lesson = lessons.lessons[0];
    let p = loadProgress('nobody');
    expect(p).toEqual({ steps: {}, puzzles: [] });
    p = markStep(p, lesson.id, lesson.steps[0].id);
    p = markStep(p, lesson.id, lesson.steps[0].id);
    expect(lessonDone(p, lesson)).toBe(1);
    expect(markPuzzle(markPuzzle(p, 'x'), 'x').puzzles).toEqual(['x']);
  });
});

describe('puzzles', () => {
  it('has about sixty puzzles of three kinds with unique ids and legal positions', () => {
    expect(puzzles.length).toBeGreaterThanOrEqual(55);
    expect(new Set(puzzles.map((p) => p.id)).size).toBe(puzzles.length);
    for (const kind of ['mate1', 'material', 'fork']) expect(puzzles.filter((p) => p.kind === kind).length).toBeGreaterThanOrEqual(10);
    for (const p of puzzles) {
      const chess = new Chess(p.fen);
      expect(chess.isGameOver()).toBe(false);
      // The side not to move is not in check (legal position).
      const parts = p.fen.split(' ');
      parts[1] = parts[1] === 'w' ? 'b' : 'w';
      expect(new Chess(parts.join(' ')).inCheck()).toBe(false);
    }
  });

  it.each(puzzles.filter((p) => p.kind === 'mate1').map((p) => [p.id, p] as const))('%s: exactly one move mates', (_id, p) => {
    expect(matingMoves(p.fen)).toEqual([p.solution[0]]);
    expect(isSolution(p, p.solution[0])).toBe(true);
  });

  it.each(puzzles.filter((p) => p.kind !== 'mate1').map((p) => [p.id, p] as const))('%s: a single move wins material', (_id, p) => {
    expect(matingMoves(p.fen)).toEqual([]);
    const scored = scoreMoves({ fen: p.fen }, PUZZLE_DEPTH);
    const baseline = Math.round(materialBalance(p.fen) * 100) * (p.fen.split(' ')[1] === 'w' ? 1 : -1);
    expect(scored[0].uci).toBe(p.solution[0]);
    expect(scored[0].score).toBeGreaterThanOrEqual(baseline + WIN_MARGIN);
    expect(scored[1].score).toBeLessThanOrEqual(scored[0].score - UNIQUE_MARGIN);
    const check = checkMaterialPuzzle(p.fen);
    expect(check.unique).toBe(true);
    expect(check.fork).toBe(p.kind === 'fork');
    expect(isSolution(p, p.solution[0])).toBe(true);
    expect(isSolution(p, scored[1].uci)).toBe(false);
  });
});

describe('hints', () => {
  it('finds an undefended attacked piece', () => {
    const fen = '4k3/8/8/3n4/8/1B6/8/4K3 w - - 0 1';
    expect(threatenedPieces(fen, 'b')).toEqual([{ square: 'd5', type: 'n', kind: 'hanging' }]);
    expect(threatText({ square: 'd5', type: 'n', kind: 'hanging' })).toBe('Pozor! Tvůj jezdec na d5 je napadený a nikdo ho nekryje.');
    expect(threatText({ square: 'd1', type: 'q', kind: 'weaker' })).toBe('Pozor! Tvoje dáma na d1 je napadená slabší figurkou.');
  });

  it('explains captures, checks, mates and development', () => {
    expect(explainMove('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', 'd2d5')?.text).toBe('Táhni věží z d2 na d5. Sebere dámu zadarmo.');
    expect(explainMove('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8')?.reasons).toContain('Dá šach.');
    expect(explainMove('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'h5f7')?.reasons[0]).toBe('Dá mat!');
    expect(explainMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'g1f3')?.text).toBe('Táhni jezdcem z g1 na f3. Vyvine figurku do hry.');
    expect(explainMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4')?.reasons).toEqual(['Obsadí střed šachovnice.']);
    expect(explainMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e5')).toBeNull();
  });

  it('recognises a knight fork', () => {
    expect(explainMove('k3q3/8/8/3N4/8/8/8/7K w - - 0 1', 'd5c7')?.reasons).toEqual(['Dá šach.', 'Napadne dvě figury najednou — vidlička!']);
    expect(explainMove('k7/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7')?.reasons.join(' ')).not.toContain('vidlička');
  });

  it('describes a blunder by the reply it allows', () => {
    expect(blunderText('4k3/8/8/3q4/8/8/3R4/4K3 b - - 0 1', 'd5d2')).toBe('Pozor! Soupeř by ti mohl sebrat věž (Qxd2+). Chceš tah vrátit?');
    expect(blunderText('4k3/8/8/8/8/8/8/4K3 w - - 0 1', null)).toContain('vrátit');
  });

  it('gives preschoolers the most help', () => {
    expect(hintProfile('piskoviste')).toEqual({ showMoves: true, threatWarnings: true, blunderCheck: true, adviceLimit: null });
    expect(hintProfile('hospoda').blunderCheck).toBe(false);
    expect(hintProfile('lavice', false).showMoves).toBe(false);
  });
});
