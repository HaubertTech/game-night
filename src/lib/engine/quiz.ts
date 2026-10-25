// Quiz game as a pure reducer: `reduce(state, action) -> state`.
// The state is plain JSON (no Map/Set/Date), so it can be stored in localStorage today
// and live on a server for the phone-controller mode later.

import { YEAR_TOLERANCE, hasOptions, isJudged, type EstimateQuestion, type Level, type Question, type Theme } from '../types.ts';
import { mulberry32 } from './rng.ts';
import { drawGame, type Contestant, type Turn } from './select.ts';

export type { Contestant, Turn } from './select.ts';

export const STATE_VERSION = 1;

export type Phase =
  | 'roundIntro' // choose jokers, then start the round
  | 'handover' // "Na řadě je … (podej tablet)"
  | 'question' // contestant answers
  | 'judge' // open / imitate question: answer revealed, others (the parent) confirm ✓/✗
  | 'feedback' // correct answer + fact
  | 'roundEnd' // standings after the round
  | 'finished';

export interface GameConfig {
  seed: number;
  themes: Theme[];
  questionsPerContestant: number;
  /** Seconds per question, null = no timer. Kocarek and piskoviste never have a timer (levelTimer). */
  timerSeconds: number | null;
  contestants: Contestant[];
}

/** Prvňáček reads slower: half as much time again. */
export const PRVNACEK_TIMER_FACTOR = 1.5;

/** Timer for a level given the game's base timer: none for the youngest, longer for prvnacek. */
export function levelTimer(level: Level | undefined, base: number | null): number | null {
  if (base === null) return null;
  if (level === 'kocarek' || level === 'piskoviste') return null;
  if (level === 'prvnacek') return Math.round(base * PRVNACEK_TIMER_FACTOR);
  return base;
}

export interface AnswerRecord {
  round: number;
  turn: number;
  contestantId: string;
  questionId: string;
  /** Option text, estimated number, or null (open question / timeout). */
  given: string | number | null;
  correct: boolean;
  basePoints: number;
  /** Points after the joker multiplier. */
  points: number;
  /** Relative error of an estimate (0.05 = 5 %). */
  error?: number;
  /** Estimate within the tight tolerance (praise only, no extra point). */
  precise?: boolean;
  /** Absolute difference of an estimate (|given − answer|). */
  diff?: number;
  /** Error measured against the partial tolerance (0 = exact, 1 = edge of 1 point); used to pick the best estimate. */
  closeness?: number;
  timedOut?: boolean;
}

export interface Round {
  theme: Theme;
  turns: Turn[];
}

export interface GameState {
  version: number;
  id: string;
  createdAt: string;
  config: GameConfig;
  questions: Record<string, Question>;
  rounds: Round[];
  /** Round index in which each contestant plays the joker; null = still available. */
  jokers: Record<string, number | null>;
  phase: Phase;
  roundIndex: number;
  turnIndex: number;
  answers: AnswerRecord[];
  scores: Record<string, number>;
  warnings: string[];
}

export type Action =
  | { type: 'toggleJoker'; contestantId: string }
  | { type: 'startRound' }
  | { type: 'ready' }
  | { type: 'answer'; value: string | number }
  | { type: 'timeout' }
  | { type: 'reveal' }
  | { type: 'judge'; correct: boolean }
  | { type: 'next' };

export interface CreateGameInput {
  id?: string;
  createdAt?: string;
  seed: number;
  themes: Theme[];
  questionsPerContestant: number;
  timerSeconds?: number | null;
  contestants: Contestant[];
}

export const ESTIMATE_FULL = 0.1;
export const ESTIMATE_PARTIAL = 0.25;

export function createGame(
  input: CreateGameInput,
  pool: Question[],
  seen: Record<string, readonly string[]> = {},
): GameState {
  const config: GameConfig = {
    seed: input.seed >>> 0,
    themes: input.themes.slice(),
    questionsPerContestant: input.questionsPerContestant,
    timerSeconds: input.timerSeconds ?? null,
    contestants: input.contestants.map((c) => ({ ...c, memberIds: c.memberIds.slice() })),
  };
  const drawn = drawGame({
    themes: config.themes,
    contestants: config.contestants,
    questionsPerContestant: config.questionsPerContestant,
    pool,
    seen,
    rand: mulberry32(config.seed),
  });
  return {
    version: STATE_VERSION,
    id: input.id ?? `game-${config.seed.toString(36)}`,
    createdAt: input.createdAt ?? '',
    config,
    questions: drawn.questions,
    rounds: drawn.rounds,
    jokers: Object.fromEntries(config.contestants.map((c) => [c.id, null])),
    phase: config.themes.length === 0 ? 'finished' : 'roundIntro',
    roundIndex: 0,
    turnIndex: 0,
    answers: [],
    scores: Object.fromEntries(config.contestants.map((c) => [c.id, 0])),
    warnings: drawn.warnings,
  };
}

// ---------- scoring ----------

export type EstimateTolerance = { kind: 'absolute'; full: number; partial: number } | { kind: 'relative'; full: number; partial: number };

/** Years get an absolute tolerance — 10 % of 1900 would be ±190 years. */
export function estimateTolerance(q: Pick<EstimateQuestion, 'unit' | 'tolerance'>): EstimateTolerance {
  if (q.tolerance) return { kind: 'absolute', ...q.tolerance };
  if (q.unit.trim().toLowerCase() === 'rok') return { kind: 'absolute', ...YEAR_TOLERANCE };
  return { kind: 'relative', full: ESTIMATE_FULL, partial: ESTIMATE_PARTIAL };
}

export function scoreEstimate(
  given: number,
  answer: number,
  tolerance: EstimateTolerance = { kind: 'relative', full: ESTIMATE_FULL, partial: ESTIMATE_PARTIAL },
): { points: number; error: number; diff: number; closeness: number; precise: boolean } {
  const diff = Math.abs(given - answer);
  const error = answer === 0 ? (given === 0 ? 0 : Infinity) : diff / Math.abs(answer);
  const measured = tolerance.kind === 'absolute' ? diff : error;
  // One point max, same as any other question — two points made adults' estimates worth more
  // than children's questions. `precise` only changes the praise.
  const precise = measured <= tolerance.full + 1e-9;
  const points = measured <= tolerance.partial + 1e-9 ? 1 : 0;
  const closeness = tolerance.partial > 0 ? measured / tolerance.partial : measured === 0 ? 0 : Infinity;
  return { points, error, diff, closeness, precise };
}

// ---------- selectors ----------

export function currentRound(state: GameState): Round | undefined {
  return state.rounds[state.roundIndex];
}

export function currentTurn(state: GameState): Turn | undefined {
  return currentRound(state)?.turns[state.turnIndex];
}

export function currentQuestion(state: GameState): Question | undefined {
  const turn = currentTurn(state);
  return turn ? state.questions[turn.questionId] : undefined;
}

export function getContestant(state: GameState, id: string): Contestant | undefined {
  return state.config.contestants.find((c) => c.id === id);
}

export function currentContestant(state: GameState): Contestant | undefined {
  const turn = currentTurn(state);
  return turn ? getContestant(state, turn.contestantId) : undefined;
}

export function lastAnswer(state: GameState): AnswerRecord | undefined {
  return state.answers[state.answers.length - 1];
}

export function hasJokerInRound(state: GameState, contestantId: string, round = state.roundIndex): boolean {
  return state.jokers[contestantId] === round;
}

export function canUseJoker(state: GameState, contestantId: string): boolean {
  const j = state.jokers[contestantId];
  return j === null || j === state.roundIndex;
}

export function timerFor(state: GameState, level?: Level): number | null {
  return levelTimer(level ?? currentContestant(state)?.level, state.config.timerSeconds);
}

export interface Standing {
  contestant: Contestant;
  score: number;
  roundPoints: number;
  place: number;
}

export function standings(state: GameState, upToRound = state.roundIndex): Standing[] {
  const rows = state.config.contestants.map((c) => ({
    contestant: c,
    score: state.scores[c.id] ?? 0,
    roundPoints: state.answers
      .filter((a) => a.contestantId === c.id && a.round === upToRound)
      .reduce((s, a) => s + a.points, 0),
    place: 0,
  }));
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((row, i) => {
    row.place = i > 0 && rows[i - 1].score === row.score ? rows[i - 1].place : i + 1;
  });
  return rows;
}

// ---------- reducer ----------

function finishTurn(state: GameState, record: Omit<AnswerRecord, 'round' | 'turn' | 'contestantId' | 'questionId' | 'points'>): GameState {
  const turn = currentTurn(state)!;
  const multiplier = hasJokerInRound(state, turn.contestantId) ? 2 : 1;
  const answer: AnswerRecord = {
    round: state.roundIndex,
    turn: state.turnIndex,
    contestantId: turn.contestantId,
    questionId: turn.questionId,
    ...record,
    points: record.basePoints * multiplier,
  };
  return {
    ...state,
    phase: 'feedback',
    answers: [...state.answers, answer],
    scores: { ...state.scores, [turn.contestantId]: (state.scores[turn.contestantId] ?? 0) + answer.points },
  };
}

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'toggleJoker': {
      if (state.phase !== 'roundIntro' || !(action.contestantId in state.jokers)) return state;
      const current = state.jokers[action.contestantId];
      if (current !== null && current !== state.roundIndex) return state;
      return {
        ...state,
        jokers: { ...state.jokers, [action.contestantId]: current === null ? state.roundIndex : null },
      };
    }
    case 'startRound': {
      if (state.phase !== 'roundIntro') return state;
      const round = currentRound(state);
      return { ...state, phase: round && round.turns.length > 0 ? 'handover' : 'roundEnd', turnIndex: 0 };
    }
    case 'ready':
      return state.phase === 'handover' ? { ...state, phase: 'question' } : state;
    case 'answer': {
      if (state.phase !== 'question') return state;
      const q = currentQuestion(state);
      const turn = currentTurn(state);
      if (!q || !turn) return state;
      if (hasOptions(q)) {
        if (typeof action.value !== 'string' || !q.options.includes(action.value)) return state;
        const correct = action.value === q.answer;
        return finishTurn(state, { given: action.value, correct, basePoints: correct ? 1 : 0 });
      }
      if (q.type === 'estimate') {
        const value = typeof action.value === 'number' ? action.value : Number.NaN;
        if (!Number.isFinite(value)) return state;
        const { points, error, diff, closeness, precise } = scoreEstimate(value, q.answer, estimateTolerance(q));
        return finishTurn(state, { given: value, correct: points > 0, basePoints: points, error, diff, closeness, precise });
      }
      return state; // open and imitate questions go through reveal → judge
    }
    case 'timeout':
      if (state.phase !== 'question') return state;
      return finishTurn(state, { given: null, correct: false, basePoints: 0, timedOut: true });
    case 'reveal': {
      const q = currentQuestion(state);
      return state.phase === 'question' && q && isJudged(q) ? { ...state, phase: 'judge' } : state;
    }
    case 'judge': {
      // The parent sees the model answer of an imitate question right away, so ✓/✗ works from the question too.
      const q = currentQuestion(state);
      const direct = state.phase === 'question' && q?.type === 'imitate';
      if (state.phase !== 'judge' && !direct) return state;
      return finishTurn(state, { given: null, correct: action.correct, basePoints: action.correct ? 1 : 0 });
    }
    case 'next': {
      if (state.phase === 'feedback') {
        const round = currentRound(state)!;
        return state.turnIndex + 1 < round.turns.length
          ? { ...state, phase: 'handover', turnIndex: state.turnIndex + 1 }
          : { ...state, phase: 'roundEnd' };
      }
      if (state.phase === 'roundEnd') {
        return state.roundIndex + 1 < state.rounds.length
          ? { ...state, phase: 'roundIntro', roundIndex: state.roundIndex + 1, turnIndex: 0 }
          : { ...state, phase: 'finished' };
      }
      return state;
    }
    default:
      return state;
  }
}

// ---------- end of game ----------

export interface ThemeStat {
  correct: number;
  total: number;
}

export interface BestAnswer {
  kind: 'estimate' | 'hardest';
  contestantId: string;
  questionId: string;
  given: string | number | null;
  error?: number;
  diff?: number;
}

export interface GameSummary {
  ranking: Standing[];
  /** contestantId → theme → success. Uses the question's own theme (preschool mix counts honestly). */
  themeStats: Record<string, Partial<Record<Theme, ThemeStat>>>;
  best: BestAnswer | null;
  /** contestantId → question ids answered in this game. */
  seenByContestant: Record<string, string[]>;
}

export function bestAnswer(state: GameState): BestAnswer | null {
  let best: AnswerRecord | null = null;
  for (const a of state.answers) {
    if (a.error === undefined || a.basePoints === 0) continue;
    const score = a.closeness ?? a.error;
    if (!best || score < (best.closeness ?? best.error!)) best = a;
  }
  if (best) {
    return { kind: 'estimate', contestantId: best.contestantId, questionId: best.questionId, given: best.given, error: best.error, diff: best.diff };
  }
  let hardest: AnswerRecord | null = null;
  for (const a of state.answers) {
    if (!a.correct) continue;
    const d = state.questions[a.questionId]?.difficulty ?? 1;
    if (!hardest || d > (state.questions[hardest.questionId]?.difficulty ?? 1)) hardest = a;
  }
  return hardest
    ? { kind: 'hardest', contestantId: hardest.contestantId, questionId: hardest.questionId, given: hardest.given }
    : null;
}

export function summarize(state: GameState): GameSummary {
  const themeStats: GameSummary['themeStats'] = {};
  const seenByContestant: Record<string, string[]> = {};
  for (const c of state.config.contestants) {
    themeStats[c.id] = {};
    seenByContestant[c.id] = [];
  }
  for (const a of state.answers) {
    const theme = state.questions[a.questionId]?.theme ?? state.rounds[a.round].theme;
    const stats = themeStats[a.contestantId];
    const s = (stats[theme] ??= { correct: 0, total: 0 });
    s.total++;
    if (a.correct) s.correct++;
    seenByContestant[a.contestantId].push(a.questionId);
  }
  return { ranking: standings(state), themeStats, best: bestAnswer(state), seenByContestant };
}
