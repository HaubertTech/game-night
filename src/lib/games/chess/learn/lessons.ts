// Lesson runtime: one step = a position, a goal, a hint and praise (data/chess/lessons.json).
// „Solo“ goals (stars, capture all) let the child move the same side again and again while the
// other pieces stand still; mate goals answer with the engine's best defence.

import { Chess, type Square } from 'chess.js';
import { analyze } from '../ai.ts';

export type LessonGoal =
  /** Land on every star square (solo moves). */
  | { type: 'stars'; stars: Square[] }
  /** Capture every enemy piece (solo moves); with `targets`, only those squares count. */
  | { type: 'captureAll'; targets?: Square[] }
  /** One move that captures (on `target`, if given). */
  | { type: 'capture'; target?: Square }
  /** One move that gives check. */
  | { type: 'check' }
  /** Any legal move out of check (with `accept`, only those). */
  | { type: 'escape'; accept?: string[] }
  /** Mate in `moves` against the best defence. */
  | { type: 'mate'; moves: 1 | 2 | 3 }
  | { type: 'castle'; side?: 'k' | 'q' }
  | { type: 'promote'; piece?: 'q' | 'r' | 'b' | 'n' }
  | { type: 'enpassant' }
  /** One of the listed UCI moves (opening principles, piece values). */
  | { type: 'move'; accept: string[] };

export interface LessonStep {
  id: string;
  text: string;
  fen: string;
  goal: LessonGoal;
  hint: string;
  praise: string;
  /** Reference solution (UCI, own moves only) — the tests replay it. */
  solution: string[];
}

export interface Lesson {
  id: string;
  title: string;
  icon: string;
  /** Short story the owl says before the first step. */
  intro: string;
  steps: LessonStep[];
}

export interface LessonFile {
  version: 1;
  lessons: Lesson[];
}

export interface StepState {
  fen: string;
  done: boolean;
  /** Stars or targets still to collect. */
  left: Square[];
  /** Own moves played in this step. */
  played: string[];
  /** Last opponent reply (mate goals), for highlighting. */
  reply: string | null;
  lastMove: { from: Square; to: Square } | null;
}

export type StepMoveResult =
  | { ok: true; state: StepState; message: string | null }
  | { ok: false; state: StepState; message: string };

const SOLO: ReadonlySet<LessonGoal['type']> = new Set(['stars', 'captureAll']);

export function isSolo(goal: LessonGoal): boolean {
  return SOLO.has(goal.type);
}

function load(fen: string): Chess {
  return new Chess(fen, { skipValidation: true });
}

function targetsOf(step: LessonStep): Square[] {
  if (step.goal.type === 'stars') return [...step.goal.stars];
  if (step.goal.type === 'captureAll') {
    if (step.goal.targets) return [...step.goal.targets];
    const chess = load(step.fen);
    const enemy = chess.turn() === 'w' ? 'b' : 'w';
    return chess.board().flat().filter((s) => s && s.color === enemy && s.type !== 'k').map((s) => s!.square);
  }
  return [];
}

export function startStep(step: LessonStep): StepState {
  return { fen: step.fen, done: false, left: targetsOf(step), played: [], reply: null, lastMove: null };
}

/** Same side to move again, en passant cleared (solo goals). */
function keepTurn(fen: string, turn: 'w' | 'b'): string {
  const parts = fen.split(' ');
  parts[1] = turn;
  parts[3] = '-';
  return parts.join(' ');
}

/** Legal moves of the side to move in a lesson position (also without kings). */
export function stepMoves(state: StepState): { from: Square; to: Square; promotion?: string; capture: boolean; san: string }[] {
  if (state.done) return [];
  return load(state.fen)
    .moves({ verbose: true })
    .map((m) => ({ from: m.from, to: m.to, san: m.san, capture: m.isCapture(), ...(m.promotion ? { promotion: m.promotion } : {}) }));
}

export function applyStepMove(step: LessonStep, state: StepState, uci: string): StepMoveResult {
  if (state.done) return { ok: false, state, message: 'Tenhle krok už je hotový.' };
  const chess = load(state.fen);
  const turn = chess.turn();
  let move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length > 4 ? { promotion: uci[4] } : {}) });
  } catch {
    return { ok: false, state, message: 'Takhle tahle figurka chodit nemůže.' };
  }
  const goal = step.goal;
  const played = [...state.played, uci];
  const lastMove = { from: move.from, to: move.to };

  if (goal.type === 'stars' || goal.type === 'captureAll') {
    const left = state.left.filter((sq) => sq !== move.to);
    const done = left.length === 0;
    const fen = keepTurn(chess.fen(), turn);
    const message = left.length < state.left.length && !done ? (goal.type === 'stars' ? 'Hvězdička! Ještě ' + countText(left.length) + '.' : 'Sebráno! Ještě ' + countText(left.length) + '.') : null;
    return { ok: true, state: { ...state, fen, left, done, played, lastMove, reply: null }, message: done ? step.praise : message };
  }

  const fail = (message = step.hint): StepMoveResult => ({ ok: false, state, message });
  if (goal.type === 'capture') {
    if (!move.captured || (goal.target && move.to !== goal.target)) return fail();
  } else if (goal.type === 'check') {
    if (!chess.inCheck()) return fail();
  } else if (goal.type === 'escape') {
    if (goal.accept && !goal.accept.includes(uci)) return fail();
  } else if (goal.type === 'castle') {
    const ok = goal.side === 'q' ? move.isQueensideCastle() : goal.side === 'k' ? move.isKingsideCastle() : move.isKingsideCastle() || move.isQueensideCastle();
    if (!ok) return fail();
  } else if (goal.type === 'promote') {
    if (!move.isPromotion() || (goal.piece && move.promotion !== goal.piece)) return fail();
  } else if (goal.type === 'enpassant') {
    if (!move.isEnPassant()) return fail();
  } else if (goal.type === 'move') {
    if (!goal.accept.includes(uci)) return fail();
  } else if (goal.type === 'mate') {
    if (chess.isCheckmate()) return { ok: true, state: { ...state, fen: chess.fen(), done: true, played, lastMove, reply: null }, message: step.praise };
    const ownMovesLeft = goal.moves - played.length;
    if (ownMovesLeft <= 0) return fail('Tohle ještě nebyl mat. Zkus to znovu!');
    // Still has moves: the move must keep a forced mate within the remaining moves.
    const check = analyze({ fen: chess.fen() }, { maxDepth: ownMovesLeft * 2 + 1 });
    if (check.mateIn === null || check.mateIn >= 0 || -check.mateIn > ownMovesLeft) return fail();
    const reply = check.uci;
    if (!reply) return fail();
    const r = chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), ...(reply.length > 4 ? { promotion: reply[4] } : {}) });
    return { ok: true, state: { ...state, fen: chess.fen(), played, lastMove: { from: r.from, to: r.to }, reply }, message: 'Dobře! Soupeř uhnul. Teď dokonči mat.' };
  }
  return { ok: true, state: { ...state, fen: chess.fen(), done: true, played, lastMove, reply: null }, message: step.praise };
}

function countText(n: number): string {
  if (n === 1) return 'jedna';
  if (n >= 2 && n <= 4) return `${n === 2 ? 'dvě' : n === 3 ? 'tři' : 'čtyři'}`;
  return String(n);
}

/** Structural problems of a lesson file (empty = fine). Used by the tests and the dev overlay. */
export function validateLessons(file: LessonFile): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const lesson of file.lessons) {
    if (ids.has(lesson.id)) problems.push(`duplicate lesson ${lesson.id}`);
    ids.add(lesson.id);
    if (!lesson.steps.length) problems.push(`${lesson.id}: no steps`);
    const stepIds = new Set<string>();
    for (const step of lesson.steps) {
      const where = `${lesson.id}/${step.id}`;
      if (stepIds.has(step.id)) problems.push(`${where}: duplicate step id`);
      stepIds.add(step.id);
      for (const field of ['text', 'hint', 'praise'] as const) if (!step[field]?.trim()) problems.push(`${where}: missing ${field}`);
      try {
        load(step.fen);
      } catch (err) {
        problems.push(`${where}: bad FEN (${(err as Error).message})`);
      }
    }
  }
  return problems;
}

// ---------- progress (localStorage per player) ----------

const PROGRESS_PREFIX = 'domaci-liga:chess:lessons:';

export interface LessonProgress {
  /** lessonId → ids of finished steps */
  steps: Record<string, string[]>;
  /** puzzle ids solved */
  puzzles: string[];
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(playerId: string): LessonProgress {
  try {
    const raw = storage()?.getItem(PROGRESS_PREFIX + playerId);
    const parsed = raw ? (JSON.parse(raw) as Partial<LessonProgress>) : {};
    return { steps: parsed.steps && typeof parsed.steps === 'object' ? parsed.steps : {}, puzzles: Array.isArray(parsed.puzzles) ? parsed.puzzles : [] };
  } catch {
    return { steps: {}, puzzles: [] };
  }
}

export function saveProgress(playerId: string, progress: LessonProgress): void {
  try {
    storage()?.setItem(PROGRESS_PREFIX + playerId, JSON.stringify(progress));
  } catch {
    // private mode / full storage: progress just is not remembered
  }
}

export function markStep(progress: LessonProgress, lessonId: string, stepId: string): LessonProgress {
  const done = new Set(progress.steps[lessonId] ?? []);
  done.add(stepId);
  return { ...progress, steps: { ...progress.steps, [lessonId]: [...done] } };
}

export function markPuzzle(progress: LessonProgress, puzzleId: string): LessonProgress {
  return progress.puzzles.includes(puzzleId) ? progress : { ...progress, puzzles: [...progress.puzzles, puzzleId] };
}

export function lessonDone(progress: LessonProgress, lesson: Lesson): number {
  const done = new Set(progress.steps[lesson.id] ?? []);
  return lesson.steps.filter((s) => done.has(s.id)).length;
}
