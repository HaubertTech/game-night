// Live mode (TV + phones) as a pure reducer on top of the pass-mode draw and scoring.
//
// Everyone answers at the same time: a round is a theme, a step is the i-th question of the
// round for every contestant (each at their own level). Contestants marked `onTv` (a preschooler
// without a phone) answer on the TV after the phones, one by one.
//
// The state is plain JSON. Time never comes from the clock here: every action carries `now`
// (epoch ms) and the server sends `timeout` once `deadline` has passed.

import { hasOptions, isJudged, type Level, type Question, type Theme } from '../types.ts';
import {
  createGame,
  scoreEstimate,
  estimateTolerance,
  levelTimer,
  standings,
  summarize,
  STATE_VERSION,
  type AnswerRecord,
  type Contestant,
  type GameState,
  type GameSummary,
  type Round,
  type Standing,
  type Turn,
} from './quiz.ts';

export const LIVE_STATE_VERSION = 1;
/** Longest accepted free-text answer to an open question. */
export const OPEN_ANSWER_MAX = 200;
/** Imitate answers the host (or a parent on a phone) gives directly: done / try another one. */
export const IMITATE_DONE = '✓';
export const IMITATE_FAILED = '✗';

export interface LiveContestant extends Contestant {
  /** Plays on the TV instead of a phone (answers after the phones, read aloud). */
  onTv: boolean;
}

export interface LiveConfig {
  seed: number;
  themes: Theme[];
  questionsPerContestant: number;
  /** Seconds per question, null = no timer. Preschool never has a timer. */
  timerSeconds: number | null;
  contestants: LiveContestant[];
}

export type LivePhase =
  | 'lobby' // phones join, host marks TV contestants
  | 'roundIntro' // jokers, then the host starts the round
  | 'asking' // answers are being collected (stage phones → tv)
  | 'reveal' // everyone's result for the step; host judges open answers
  | 'roundEnd' // standings after the round
  | 'finished';

export type AskStage = 'phones' | 'tv';

export interface PendingAnswer {
  /** Option text, estimate, open-answer text, or null on timeout. */
  given: string | number | null;
  at: number;
  timedOut?: boolean;
}

export interface LiveState {
  mode: 'live';
  version: number;
  id: string;
  createdAt: string;
  config: LiveConfig;
  questions: Record<string, Question>;
  rounds: Round[];
  jokers: Record<string, number | null>;
  phase: LivePhase;
  roundIndex: number;
  /** Step within the round (i-th question of every contestant). */
  step: number;
  /** Sub-phase of `asking`, null otherwise. */
  stage: AskStage | null;
  /** Index into tvContestants(...) while stage = 'tv'. */
  tvIndex: number;
  /** Epoch ms when the current stage (or TV turn) times out; null = no timer. */
  deadline: number | null;
  /** Answers collected in the current step, keyed by contestant id. Cleared on the next step. */
  pending: Record<string, PendingAnswer>;
  /** Contestants whose open answer in this step still waits for the host's ✓/✗. */
  unjudged: string[];
  /** Contestants removed by the host; they are no longer asked. */
  kicked: string[];
  answers: AnswerRecord[];
  scores: Record<string, number>;
  warnings: string[];
}

export type Actor = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'system' };

export type LiveCommand =
  | { type: 'setOnTv'; contestantId: string; onTv: boolean }
  | { type: 'start' }
  | { type: 'toggleJoker'; contestantId: string }
  | { type: 'startRound' }
  | { type: 'answer'; value: string | number; contestantId?: string }
  | { type: 'closeAnswers' }
  | { type: 'timeout' }
  | { type: 'judge'; contestantId: string; correct: boolean }
  | { type: 'next' }
  | { type: 'kick'; contestantId: string };

export type LiveAction = LiveCommand & { by: Actor; now: number };

export type LiveError =
  | 'forbidden'
  | 'wrongPhase'
  | 'unknownContestant'
  | 'invalidAnswer'
  | 'alreadyAnswered'
  | 'notYet'
  | 'unjudged';

export type LiveResult = { ok: true; state: LiveState } | { ok: false; error: LiveError; state: LiveState };

export interface CreateLiveInput {
  id?: string;
  createdAt?: string;
  seed: number;
  themes: Theme[];
  questionsPerContestant: number;
  timerSeconds?: number | null;
  contestants: (Contestant & { onTv?: boolean })[];
}

/** Same draw as the tablet game (drawGame via createGame), so a seed gives the same questions. */
export function createLiveGame(
  input: CreateLiveInput,
  pool: Question[],
  seen: Record<string, readonly string[]> = {},
): LiveState {
  const base = createGame(
    {
      id: input.id,
      createdAt: input.createdAt,
      seed: input.seed,
      themes: input.themes,
      questionsPerContestant: input.questionsPerContestant,
      timerSeconds: input.timerSeconds,
      contestants: input.contestants.map(({ onTv: _onTv, ...c }) => c),
    },
    pool,
    seen,
  );
  const onTv = new Map(input.contestants.map((c) => [c.id, c.onTv === true]));
  return {
    mode: 'live',
    version: LIVE_STATE_VERSION,
    id: input.id ?? `live-${base.config.seed.toString(36)}`,
    createdAt: base.createdAt,
    config: {
      ...base.config,
      contestants: base.config.contestants.map((c) => ({ ...c, onTv: onTv.get(c.id) ?? false })),
    },
    questions: base.questions,
    rounds: base.rounds,
    jokers: base.jokers,
    phase: 'lobby',
    roundIndex: 0,
    step: 0,
    stage: null,
    tvIndex: 0,
    deadline: null,
    pending: {},
    unjudged: [],
    kicked: [],
    answers: [],
    scores: base.scores,
    warnings: base.warnings,
  };
}

// ---------- selectors ----------

export function liveContestant(state: LiveState, id: string): LiveContestant | undefined {
  return state.config.contestants.find((c) => c.id === id);
}

export function isKicked(state: LiveState, id: string): boolean {
  return state.kicked.includes(id);
}

/** Timer for one contestant in seconds; kocarek and piskoviste never have one, prvnacek has a longer one. */
export function liveTimerFor(state: LiveState, level: Level): number | null {
  return levelTimer(level, state.config.timerSeconds);
}

/** Number of steps in a round = most questions any contestant has in it. */
export function stepCount(state: LiveState, roundIndex = state.roundIndex): number {
  const round = state.rounds[roundIndex];
  if (!round) return 0;
  const counts = new Map<string, number>();
  for (const t of round.turns) counts.set(t.contestantId, (counts.get(t.contestantId) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

/** The contestant's turn in a step and its index in `round.turns` (AnswerRecord.turn). */
export function stepTurn(
  state: LiveState,
  contestantId: string,
  step = state.step,
  roundIndex = state.roundIndex,
): { turn: Turn; index: number } | undefined {
  const turns = state.rounds[roundIndex]?.turns ?? [];
  let k = 0;
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].contestantId !== contestantId) continue;
    if (k === step) return { turn: turns[i], index: i };
    k++;
  }
  return undefined;
}

/** Contestants asked in the current step (config order), kicked ones excluded. */
export function stepParticipants(state: LiveState): LiveContestant[] {
  return state.config.contestants.filter((c) => !isKicked(state, c.id) && stepTurn(state, c.id) !== undefined);
}

export function phoneContestants(state: LiveState): LiveContestant[] {
  return stepParticipants(state).filter((c) => !c.onTv);
}

export function tvContestants(state: LiveState): LiveContestant[] {
  return stepParticipants(state).filter((c) => c.onTv);
}

/** The contestant currently answering on the TV, if any. */
export function currentTvContestant(state: LiveState): LiveContestant | undefined {
  return state.phase === 'asking' && state.stage === 'tv' ? tvContestants(state)[state.tvIndex] : undefined;
}

/** Answer records of the current step (filled at reveal). */
export function stepAnswers(state: LiveState): AnswerRecord[] {
  const indices = new Set(
    state.config.contestants.map((c) => stepTurn(state, c.id)?.index).filter((i): i is number => i !== undefined),
  );
  return state.answers.filter((a) => a.round === state.roundIndex && indices.has(a.turn));
}

/** Pass-mode-shaped copy, so standings/summarize from quiz.ts work unchanged. */
export function toGameState(state: LiveState): GameState {
  return {
    version: STATE_VERSION,
    id: state.id,
    createdAt: state.createdAt,
    config: { ...state.config, contestants: state.config.contestants.map(({ onTv: _onTv, ...c }) => c) },
    questions: state.questions,
    rounds: state.rounds,
    jokers: state.jokers,
    phase: state.phase === 'finished' ? 'finished' : 'roundEnd',
    roundIndex: Math.min(state.roundIndex, Math.max(0, state.rounds.length - 1)),
    turnIndex: 0,
    answers: state.answers,
    scores: state.scores,
    warnings: state.warnings,
  };
}

export function liveStandings(state: LiveState): Standing[] {
  return standings(toGameState(state));
}

/** Same shape as the tablet summary, ready for the same persistence. */
export function summarizeLive(state: LiveState): GameSummary {
  return summarize(toGameState(state));
}

// ---------- transitions ----------

function deadlineFor(state: LiveState, contestants: LiveContestant[], now: number): number | null {
  // Everyone in the stage answers at once: the longest timer of the timed contestants wins.
  const timers = contestants.map((c) => liveTimerFor(state, c.level)).filter((t): t is number => t !== null);
  return timers.length === 0 ? null : now + Math.max(...timers) * 1000;
}

function beginStep(state: LiveState, step: number, now: number): LiveState {
  if (step >= stepCount(state)) {
    return { ...state, phase: 'roundEnd', stage: null, deadline: null, pending: {}, unjudged: [] };
  }
  const next: LiveState = { ...state, phase: 'asking', step, pending: {}, unjudged: [], tvIndex: 0 };
  if (stepParticipants(next).length === 0) return beginStep(next, step + 1, now);
  return enterPhones(next, now);
}

function enterPhones(state: LiveState, now: number): LiveState {
  const phones = phoneContestants(state);
  if (phones.length === 0) return enterTv(state, 0, now);
  const next: LiveState = { ...state, stage: 'phones', deadline: deadlineFor(state, phones, now) };
  return phonesDone(next) ? enterTv(next, 0, now) : next;
}

function enterTv(state: LiveState, tvIndex: number, now: number): LiveState {
  const tv = tvContestants(state);
  // Skip TV contestants that already have an answer (e.g. closed by the host).
  let i = tvIndex;
  while (i < tv.length && state.pending[tv[i].id]) i++;
  if (i >= tv.length) return toReveal(state);
  return { ...state, stage: 'tv', tvIndex: i, deadline: deadlineFor(state, [tv[i]], now) };
}

function phonesDone(state: LiveState): boolean {
  return phoneContestants(state).every((c) => state.pending[c.id] !== undefined);
}

function record(state: LiveState, c: LiveContestant): AnswerRecord {
  const { turn, index } = stepTurn(state, c.id)!;
  const q = state.questions[turn.questionId];
  const p = state.pending[c.id] ?? { given: null, at: 0, timedOut: true };
  const multiplier = state.jokers[c.id] === state.roundIndex ? 2 : 1;
  const base = { round: state.roundIndex, turn: index, contestantId: c.id, questionId: q.id };
  if (p.given === null) {
    return { ...base, given: null, correct: false, basePoints: 0, points: 0, ...(p.timedOut ? { timedOut: true } : {}) };
  }
  if (hasOptions(q)) {
    const correct = p.given === q.answer;
    const basePoints = correct ? 1 : 0;
    return { ...base, given: p.given, correct, basePoints, points: basePoints * multiplier };
  }
  if (q.type === 'estimate') {
    const { points, error, diff, closeness, precise } = scoreEstimate(p.given as number, q.answer, estimateTolerance(q));
    return { ...base, given: p.given, correct: points > 0, basePoints: points, points: points * multiplier, error, diff, closeness, precise };
  }
  if (q.type === 'imitate' && (p.given === IMITATE_DONE || p.given === IMITATE_FAILED)) {
    const correct = p.given === IMITATE_DONE;
    const basePoints = correct ? 1 : 0;
    return { ...base, given: p.given, correct, basePoints, points: basePoints * multiplier };
  }
  // Open (and imitate without a direct verdict): 0 until the host judges it.
  return { ...base, given: p.given, correct: false, basePoints: 0, points: 0 };
}

function toReveal(state: LiveState): LiveState {
  const records = stepParticipants(state).map((c) => record(state, c));
  const scores = { ...state.scores };
  for (const r of records) scores[r.contestantId] = (scores[r.contestantId] ?? 0) + r.points;
  const unjudged = records
    .filter((r) => r.given !== null && needsJudging(state.questions[r.questionId], r.given))
    .map((r) => r.contestantId);
  return {
    ...state,
    phase: 'reveal',
    stage: null,
    deadline: null,
    answers: [...state.answers, ...records],
    scores,
    unjudged,
  };
}

/** Moves on once everyone in the current stage has answered. */
function advanceIfDone(state: LiveState, now: number): LiveState {
  if (state.phase !== 'asking') return state;
  if (state.stage === 'phones') return phonesDone(state) ? enterTv(state, 0, now) : state;
  if (state.stage === 'tv') {
    const current = tvContestants(state)[state.tvIndex];
    return !current || state.pending[current.id] ? enterTv(state, state.tvIndex + 1, now) : state;
  }
  return state;
}

/** Open answers, and imitate answers that only say "done" (a phone), wait for the host's ✓/✗. */
function needsJudging(q: Question | undefined, given: string | number): boolean {
  if (!q) return false;
  if (q.type === 'open') return true;
  return q.type === 'imitate' && given !== IMITATE_DONE && given !== IMITATE_FAILED;
}

function validAnswer(q: Question, turn: Turn, value: unknown): value is string | number {
  if (hasOptions(q)) return typeof value === 'string' && (turn.options ?? q.options).includes(value);
  if (q.type === 'estimate') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === 'string' && value.length <= OPEN_ANSWER_MAX;
}

// ---------- reducer ----------

const fail = (state: LiveState, error: LiveError): LiveResult => ({ ok: false, error, state });
const ok = (state: LiveState): LiveResult => ({ ok: true, state });

const isHost = (a: Actor) => a.role === 'host';

/** Applies an action and says why it was refused. Never mutates `state`. */
export function applyLive(state: LiveState, action: LiveAction): LiveResult {
  const { by, now } = action;
  if (action.type !== 'timeout' && by.role === 'system') return fail(state, 'forbidden');
  if (by.role === 'contestant' && (!liveContestant(state, by.contestantId) || isKicked(state, by.contestantId))) {
    return fail(state, 'forbidden');
  }

  switch (action.type) {
    case 'setOnTv': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'lobby' && state.phase !== 'roundIntro') return fail(state, 'wrongPhase');
      if (!liveContestant(state, action.contestantId)) return fail(state, 'unknownContestant');
      const contestants = state.config.contestants.map((c) =>
        c.id === action.contestantId ? { ...c, onTv: action.onTv === true } : c,
      );
      return ok({ ...state, config: { ...state.config, contestants } });
    }
    case 'start': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'lobby') return fail(state, 'wrongPhase');
      return ok({ ...state, phase: state.rounds.length === 0 ? 'finished' : 'roundIntro' });
    }
    case 'toggleJoker': {
      if (by.role === 'contestant' && by.contestantId !== action.contestantId) return fail(state, 'forbidden');
      if (state.phase !== 'roundIntro') return fail(state, 'wrongPhase');
      if (!(action.contestantId in state.jokers) || isKicked(state, action.contestantId)) {
        return fail(state, 'unknownContestant');
      }
      const current = state.jokers[action.contestantId];
      if (current !== null && current !== state.roundIndex) return fail(state, 'forbidden');
      return ok({
        ...state,
        jokers: { ...state.jokers, [action.contestantId]: current === null ? state.roundIndex : null },
      });
    }
    case 'startRound': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'roundIntro') return fail(state, 'wrongPhase');
      return ok(beginStep(state, 0, now));
    }
    case 'answer': {
      if (state.phase !== 'asking') return fail(state, 'wrongPhase');
      let contestantId: string;
      if (by.role === 'contestant') {
        if (action.contestantId !== undefined && action.contestantId !== by.contestantId) return fail(state, 'forbidden');
        contestantId = by.contestantId;
        const c = liveContestant(state, contestantId)!;
        if (c.onTv) return fail(state, 'forbidden');
        if (state.stage !== 'phones') return fail(state, 'wrongPhase');
      } else {
        // The host answers only for the contestant currently on the TV.
        const tv = currentTvContestant(state);
        if (!tv) return fail(state, 'wrongPhase');
        if (action.contestantId !== undefined && action.contestantId !== tv.id) return fail(state, 'forbidden');
        contestantId = tv.id;
      }
      const st = stepTurn(state, contestantId);
      if (!st) return fail(state, 'forbidden');
      if (state.pending[contestantId]) return fail(state, 'alreadyAnswered');
      const q = state.questions[st.turn.questionId];
      const value = isJudged(q) && typeof action.value === 'string' ? action.value.trim() : action.value;
      if (!validAnswer(q, st.turn, value)) return fail(state, 'invalidAnswer');
      const next = { ...state, pending: { ...state.pending, [contestantId]: { given: value, at: now } } };
      return ok(advanceIfDone(next, now));
    }
    case 'closeAnswers':
    case 'timeout': {
      if (action.type === 'closeAnswers' ? !isHost(by) : by.role !== 'system') return fail(state, 'forbidden');
      if (state.phase !== 'asking') return fail(state, 'wrongPhase');
      if (action.type === 'timeout' && (state.deadline === null || now < state.deadline)) return fail(state, 'notYet');
      const pending = { ...state.pending };
      const timedOut = (c: LiveContestant) => {
        if (!pending[c.id]) pending[c.id] = { given: null, at: now, timedOut: true };
      };
      if (state.stage === 'phones') {
        // The timer does not apply to preschoolers; only the host can close their answer.
        for (const c of phoneContestants(state)) {
          if (action.type === 'closeAnswers' || liveTimerFor(state, c.level) !== null) timedOut(c);
        }
      } else {
        const tv = currentTvContestant(state);
        if (tv) timedOut(tv);
      }
      const next = advanceIfDone({ ...state, pending }, now);
      // Still waiting (an untimed contestant on a phone): the timer is spent.
      return ok(next.phase === 'asking' && next.stage === state.stage && next.tvIndex === state.tvIndex
        ? { ...next, deadline: null }
        : next);
    }
    case 'judge': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'reveal') return fail(state, 'wrongPhase');
      const st = stepTurn(state, action.contestantId);
      if (!st) return fail(state, 'unknownContestant');
      const i = state.answers.findIndex(
        (a) => a.round === state.roundIndex && a.turn === st.index && a.contestantId === action.contestantId,
      );
      const old = state.answers[i];
      const judgedQ = old ? state.questions[old.questionId] : undefined;
      if (!old || !judgedQ || !isJudged(judgedQ)) return fail(state, 'forbidden');
      const multiplier = state.jokers[action.contestantId] === state.roundIndex ? 2 : 1;
      const basePoints = action.correct ? 1 : 0;
      const updated: AnswerRecord = { ...old, correct: action.correct, basePoints, points: basePoints * multiplier };
      const answers = state.answers.slice();
      answers[i] = updated;
      return ok({
        ...state,
        answers,
        scores: { ...state.scores, [old.contestantId]: (state.scores[old.contestantId] ?? 0) + updated.points - old.points },
        unjudged: state.unjudged.filter((id) => id !== action.contestantId),
      });
    }
    case 'next': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase === 'reveal') {
        if (state.unjudged.length > 0) return fail(state, 'unjudged');
        return ok(beginStep(state, state.step + 1, now));
      }
      if (state.phase === 'roundEnd') {
        return ok(
          state.roundIndex + 1 < state.rounds.length
            ? { ...state, phase: 'roundIntro', roundIndex: state.roundIndex + 1, step: 0, stage: null, deadline: null }
            : { ...state, phase: 'finished', stage: null, deadline: null },
        );
      }
      return fail(state, 'wrongPhase');
    }
    case 'kick': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase === 'finished') return fail(state, 'wrongPhase');
      if (!liveContestant(state, action.contestantId)) return fail(state, 'unknownContestant');
      if (isKicked(state, action.contestantId)) return ok(state);
      const next: LiveState = {
        ...state,
        kicked: [...state.kicked, action.contestantId],
        unjudged: state.unjudged.filter((id) => id !== action.contestantId),
      };
      if (next.phase !== 'asking') return ok(next);
      // Re-anchor the TV turn: kicking shifts the TV order.
      if (next.stage === 'tv') {
        const current = currentTvContestant(state)!;
        const tv = tvContestants(next);
        const same = tv.findIndex((c) => c.id === current.id);
        if (same !== -1) return ok({ ...next, tvIndex: same });
        const i = tv.findIndex((c) => !next.pending[c.id]);
        return ok(i === -1 ? toReveal(next) : enterTv(next, i, now));
      }
      return ok(stepParticipants(next).length === 0 ? toReveal(next) : advanceIfDone(next, now));
    }
    default:
      return fail(state, 'wrongPhase');
  }
}

/** Reducer form: refused actions leave the state unchanged. */
export function reduceLive(state: LiveState, action: LiveAction): LiveState {
  return applyLive(state, action).state;
}
