// Versioned messages between the live server and its clients (TV = host, phones = players),
// plus `viewFor`, which turns the authoritative state into what one screen may see.
// Correct answers, facts and other contestants' questions never leave the server before reveal.

import type { Level, Question, Theme } from '../types.ts';
import type { GameSummary } from '../engine/quiz.ts';
import {
  currentTvContestant,
  liveStandings,
  stepAnswers,
  stepCount,
  stepTurn,
  summarizeLive,
  OPEN_ANSWER_MAX,
  type AskStage,
  type LiveCommand,
  type LivePhase,
  type LiveState,
} from '../engine/live.ts';

export const PROTOCOL_VERSION = 1;
/** Largest accepted client message (bytes); the ws server enforces the same limit. */
export const MAX_MESSAGE_BYTES = 4096;

export type ClientRole = 'host' | 'player';

// ---------- client → server ----------

export type ClientMessage =
  | { v: number; type: 'hello'; code: string; role: ClientRole; token?: string }
  | { v: number; type: 'join'; contestantId: string }
  | { v: number; type: 'leave' }
  | { v: number; type: 'action'; action: LiveCommand }
  | { v: number; type: 'ping'; t?: number };

// ---------- server → client ----------

export type ErrorCode =
  | 'badMessage'
  | 'version'
  | 'roomNotFound'
  | 'forbidden'
  | 'notHello'
  | 'notJoined'
  | 'taken'
  | 'kicked'
  | 'rateLimited'
  | 'serverError'
  // engine refusals (LiveError)
  | 'wrongPhase'
  | 'unknownContestant'
  | 'invalidAnswer'
  | 'alreadyAnswered'
  | 'notYet'
  | 'unjudged';

export interface Presence {
  /** A phone has claimed this contestant (survives disconnects). */
  claimed: boolean;
  /** At least one connected phone is attached to it right now. */
  online: boolean;
}

export type ServerMessage =
  | { v: number; type: 'welcome'; code: string; role: ClientRole; token: string; contestantId: string | null }
  | { v: number; type: 'state'; view: LiveView; presence: Record<string, Presence> }
  | { v: number; type: 'error'; code: ErrorCode; message: string }
  | { v: number; type: 'pong'; t: number | null };

// ---------- views ----------

export type Viewer = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'spectator' };

/** A question without its answer, fact, accepted spellings or source. */
export interface PublicQuestion {
  id: string;
  type: Question['type'];
  level: Level;
  theme: Theme;
  text: string;
  image?: string;
  /** Shuffled options of the turn (choice only). */
  options?: string[];
  unit?: string;
  /** Question comes from another theme than the round (preschool mix). */
  fallback: boolean;
}

export interface ContestantView {
  id: string;
  name: string;
  avatar: string;
  level: Level;
  onTv: boolean;
  kicked: boolean;
  /** Round in which the joker is played, null = still available. */
  joker: number | null;
  score: number;
  /** Has a question in the current step. */
  inStep: boolean;
  /** Has answered in the current step (never says what). */
  answered: boolean;
}

export interface RevealedAnswer {
  contestantId: string;
  question: Question;
  given: string | number | null;
  correct: boolean;
  basePoints: number;
  points: number;
  error?: number;
  timedOut?: boolean;
  joker: boolean;
  /** Open answer still waiting for the host. */
  awaitingJudge: boolean;
}

export interface StandingView {
  contestantId: string;
  score: number;
  roundPoints: number;
  place: number;
}

export interface LiveView {
  v: number;
  viewer: Viewer['role'];
  /** Contestant this phone plays for (contestant viewer only). */
  me: string | null;
  id: string;
  phase: LivePhase;
  stage: AskStage | null;
  roundIndex: number;
  roundCount: number;
  theme: Theme | null;
  themes: Theme[];
  step: number;
  stepCount: number;
  deadline: number | null;
  timerSeconds: number | null;
  contestants: ContestantView[];
  /** Phone: its own question while asking. Host: the TV contestant's question in stage tv. */
  question: PublicQuestion | null;
  questionFor: string | null;
  /** Phone: what it answered in this step (undefined = not yet). */
  myAnswer?: string | number | null;
  /** Every result of the step, only in reveal. */
  reveal: RevealedAnswer[] | null;
  unjudged: string[];
  standings: StandingView[];
  /** Host only. */
  warnings: string[];
  /** Only when finished. */
  summary: GameSummary | null;
  openAnswerMax: number;
}

function publicQuestion(state: LiveState, contestantId: string): PublicQuestion | null {
  const st = stepTurn(state, contestantId);
  if (!st) return null;
  const q = state.questions[st.turn.questionId];
  if (!q) return null;
  return {
    id: q.id,
    type: q.type,
    level: q.level,
    theme: q.theme,
    text: q.text,
    ...(q.image ? { image: q.image } : {}),
    ...(q.type === 'choice' ? { options: (st.turn.options ?? q.options).slice() } : {}),
    ...(q.type === 'estimate' ? { unit: q.unit } : {}),
    fallback: st.turn.fallback,
  };
}

/** What one screen may see. The result is plain JSON and safe to send as is. */
export function viewFor(state: LiveState, viewer: Viewer): LiveView {
  const me = viewer.role === 'contestant' ? viewer.contestantId : null;
  const asking = state.phase === 'asking';
  const inStep = (id: string) => (asking || state.phase === 'reveal') && stepTurn(state, id) !== undefined;

  let question: PublicQuestion | null = null;
  let questionFor: string | null = null;
  if (asking && me && state.stage === 'phones' && !state.pending[me]) {
    const c = state.config.contestants.find((x) => x.id === me);
    if (c && !c.onTv && !state.kicked.includes(me)) {
      question = publicQuestion(state, me);
      questionFor = question ? me : null;
    }
  } else if (asking && viewer.role === 'host') {
    const tv = currentTvContestant(state);
    if (tv) {
      question = publicQuestion(state, tv.id);
      questionFor = question ? tv.id : null;
    }
  }

  const reveal: RevealedAnswer[] | null =
    state.phase === 'reveal'
      ? stepAnswers(state).map((a) => ({
          contestantId: a.contestantId,
          question: state.questions[a.questionId],
          given: a.given,
          correct: a.correct,
          basePoints: a.basePoints,
          points: a.points,
          ...(a.error !== undefined && Number.isFinite(a.error) ? { error: a.error } : {}),
          ...(a.timedOut ? { timedOut: true } : {}),
          joker: state.jokers[a.contestantId] === state.roundIndex,
          awaitingJudge: state.unjudged.includes(a.contestantId),
        }))
      : null;

  return {
    v: PROTOCOL_VERSION,
    viewer: viewer.role,
    me,
    id: state.id,
    phase: state.phase,
    stage: state.stage,
    roundIndex: state.roundIndex,
    roundCount: state.rounds.length,
    theme: state.rounds[state.roundIndex]?.theme ?? null,
    themes: state.config.themes.slice(),
    step: state.step,
    stepCount: stepCount(state),
    deadline: state.deadline,
    timerSeconds: state.config.timerSeconds,
    contestants: state.config.contestants.map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      level: c.level,
      onTv: c.onTv,
      kicked: state.kicked.includes(c.id),
      joker: state.jokers[c.id] ?? null,
      score: state.scores[c.id] ?? 0,
      inStep: inStep(c.id),
      answered: asking && state.pending[c.id] !== undefined,
    })),
    question,
    questionFor,
    ...(me && asking && state.pending[me] ? { myAnswer: state.pending[me].given } : {}),
    reveal,
    unjudged: state.phase === 'reveal' ? state.unjudged.slice() : [],
    standings: liveStandings(state).map((s) => ({
      contestantId: s.contestant.id,
      score: s.score,
      roundPoints: s.roundPoints,
      place: s.place,
    })),
    warnings: viewer.role === 'host' ? state.warnings.slice() : [],
    summary: state.phase === 'finished' ? summarizeLive(state) : null,
    openAnswerMax: OPEN_ANSWER_MAX,
  };
}

// ---------- validation ----------

const isStr = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Commands a client may send; `timeout` is server-only. */
function parseCommand(raw: unknown): LiveCommand | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'start':
    case 'startRound':
    case 'closeAnswers':
    case 'next':
      return { type: raw.type };
    case 'toggleJoker':
    case 'kick':
      return isStr(raw.contestantId) ? { type: raw.type, contestantId: raw.contestantId } : null;
    case 'setOnTv':
      return isStr(raw.contestantId) && typeof raw.onTv === 'boolean'
        ? { type: 'setOnTv', contestantId: raw.contestantId, onTv: raw.onTv }
        : null;
    case 'judge':
      return isStr(raw.contestantId) && typeof raw.correct === 'boolean'
        ? { type: 'judge', contestantId: raw.contestantId, correct: raw.correct }
        : null;
    case 'answer': {
      const value = raw.value;
      const okValue =
        (typeof value === 'string' && value.length <= OPEN_ANSWER_MAX) || (typeof value === 'number' && Number.isFinite(value));
      if (!okValue) return null;
      if (raw.contestantId !== undefined && !isStr(raw.contestantId)) return null;
      return raw.contestantId === undefined
        ? { type: 'answer', value: value as string | number }
        : { type: 'answer', value: value as string | number, contestantId: raw.contestantId as string };
    }
    default:
      return null;
  }
}

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; code: 'badMessage' | 'version'; message: string };

/** Parses and validates one raw client message. Unknown fields are dropped. */
export function parseClientMessage(text: string): ParseResult {
  if (text.length > MAX_MESSAGE_BYTES) return { ok: false, code: 'badMessage', message: 'Zpráva je příliš dlouhá.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: 'badMessage', message: 'Zpráva není platný JSON.' };
  }
  if (!isObj(raw)) return { ok: false, code: 'badMessage', message: 'Zpráva musí být objekt.' };
  if (raw.v !== PROTOCOL_VERSION) {
    return { ok: false, code: 'version', message: `Nepodporovaná verze protokolu (server má ${PROTOCOL_VERSION}).` };
  }
  const v = PROTOCOL_VERSION;
  const bad = { ok: false as const, code: 'badMessage' as const, message: 'Neplatná zpráva.' };
  switch (raw.type) {
    case 'hello': {
      if (!isStr(raw.code, 8) || (raw.role !== 'host' && raw.role !== 'player')) return bad;
      if (raw.token !== undefined && !isStr(raw.token, 128)) return bad;
      const message: ClientMessage = { v, type: 'hello', code: raw.code.toUpperCase(), role: raw.role };
      if (raw.token !== undefined) message.token = raw.token as string;
      return { ok: true, message };
    }
    case 'join':
      return isStr(raw.contestantId) ? { ok: true, message: { v, type: 'join', contestantId: raw.contestantId } } : bad;
    case 'leave':
      return { ok: true, message: { v, type: 'leave' } };
    case 'ping':
      return { ok: true, message: { v, type: 'ping', ...(typeof raw.t === 'number' && Number.isFinite(raw.t) ? { t: raw.t } : {}) } };
    case 'action': {
      const action = parseCommand(raw.action);
      return action ? { ok: true, message: { v, type: 'action', action } } : bad;
    }
    default:
      return bad;
  }
}

/** Czech messages for error codes (UI may show them directly). */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  badMessage: 'Neplatná zpráva.',
  version: 'Aplikace je zastaralá, obnov stránku.',
  roomNotFound: 'Místnost s tímto kódem neexistuje.',
  forbidden: 'Na tohle nemáš oprávnění.',
  notHello: 'Nejdřív se připoj do místnosti.',
  notJoined: 'Nejdřív si vyber, za koho hraješ.',
  taken: 'Za tohoto hráče už hraje jiný telefon.',
  kicked: 'Hostitel tě z místnosti odebral.',
  rateLimited: 'Moc rychle, zpomal.',
  serverError: 'Chyba serveru.',
  wrongPhase: 'Teď to nejde.',
  unknownContestant: 'Takový hráč ve hře není.',
  invalidAnswer: 'Neplatná odpověď.',
  alreadyAnswered: 'Už jsi odpověděl.',
  notYet: 'Čas ještě nevypršel.',
  unjudged: 'Nejdřív vyhodnoť otevřené odpovědi.',
};

export function errorMessage(code: ErrorCode): ServerMessage {
  return { v: PROTOCOL_VERSION, type: 'error', code, message: ERROR_MESSAGES[code] };
}
