// Versioned messages between the live server and its clients (TV = host, phones = players),
// plus `viewFor`, which turns the authoritative state into what one screen may see.
// Correct answers, facts and other contestants' questions never leave the server before reveal.
//
// Version 2 adds games other than the quiz (`aktivity`, `mjz`): an action names its game
// (`game`, default quiz) and the server answers with `gameState` messages for them. Quiz
// messages are unchanged, so version 1 clients keep working with quiz rooms. Chess and the
// digital card games (`chess`, `prsi-hra`, `zoliky-hra`) and Člověče, nezlob se (`clovece`) use the
// same v2 messages.

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
import type { AktivityCommand, AktivityGoal, AktivityView } from '../games/aktivity/engine.ts';
import { DIFFICULTIES } from '../games/aktivity/types.ts';
import { ANSWER_MAX, type MjzCategory, type MjzCommand, type MjzSettings } from '../games/mjz/engine.ts';
import type { MjzView } from '../games/mjz/view.ts';
import { isRoomGame, type RoomGame } from './games.ts';
import {
  parseChessRoomCommand,
  parseCloveceRoomCommand,
  parsePrsiRoomCommand,
  parseZolikyRoomCommand,
  type ChessRoomCommand,
  type ChessRoomView,
  type CloveceRoomCommand,
  type CloveceRoomView,
  type PrsiRoomCommand,
  type PrsiRoomView,
  type ZolikyRoomCommand,
  type ZolikyRoomView,
} from './table-games.ts';

export const PROTOCOL_VERSION = 2;
/** Versions the server accepts from clients (1 = quiz-only clients). */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [1, 2];

export function isSupportedVersion(v: unknown): boolean {
  return typeof v === 'number' && SUPPORTED_PROTOCOL_VERSIONS.includes(v);
}
/** Largest accepted client message (bytes); the ws server enforces the same limit. */
export const MAX_MESSAGE_BYTES = 4096;

export type ClientRole = 'host' | 'player';

// ---------- client → server ----------

export type ClientMessage =
  | { v: number; type: 'hello'; code: string; role: ClientRole; token?: string }
  | { v: number; type: 'join'; contestantId: string }
  | { v: number; type: 'leave' }
  | { v: number; type: 'action'; game?: 'quiz'; action: LiveCommand }
  | { v: number; type: 'action'; game: 'aktivity'; action: AktivityCommand }
  | { v: number; type: 'action'; game: 'mjz'; action: MjzCommand }
  | { v: number; type: 'action'; game: 'chess'; action: ChessRoomCommand }
  | { v: number; type: 'action'; game: 'prsi-hra'; action: PrsiRoomCommand }
  | { v: number; type: 'action'; game: 'zoliky-hra'; action: ZolikyRoomCommand }
  | { v: number; type: 'action'; game: 'clovece'; action: CloveceRoomCommand }
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
  | 'unjudged'
  | 'wrongGame'
  // aktivity
  | 'invalidConfig'
  | 'invalidDifficulty'
  | 'noDifficulty'
  | 'unknownTeam'
  | 'deckEmpty'
  | 'timeUp'
  // mjz
  | 'unknownCategory'
  | 'invalidSettings'
  | 'alreadyDone'
  | 'incomplete'
  | 'noLetters'
  | 'notChallengeable'
  | 'ownAnswer'
  // chess
  | 'notYourTurn'
  | 'illegalMove'
  | 'noOffer'
  | 'ownOffer'
  // prší
  | 'notInHand'
  | 'mustAnswerSeven'
  | 'mustAnswerAce'
  | 'wrongCard'
  | 'needSuit'
  | 'oberOnOber'
  | 'mustStand'
  | 'nothingToStand'
  // žolíky
  | 'drawFirst'
  | 'alreadyDrew'
  | 'emptyDiscard'
  | 'notOpened'
  | 'opening'
  | 'badMeld'
  | 'unknownMeld'
  | 'keepDiscard'
  | 'sameDiscard'
  | 'mustUseDiscard'
  | 'nothingToReset'
  // Člověče, nezlob se
  | 'rollFirst'
  | 'alreadyRolled';

export interface Presence {
  /** A phone has claimed this contestant (survives disconnects). */
  claimed: boolean;
  /** At least one connected phone is attached to it right now. */
  online: boolean;
}

export type ServerMessage =
  | { v: number; type: 'welcome'; code: string; role: ClientRole; token: string; contestantId: string | null; game?: RoomGame }
  /** Quiz rooms. `now` = server clock (epoch ms) when sent; clients use it to correct `view.deadline` for clock skew. */
  | { v: number; type: 'state'; view: LiveView; presence: Record<string, Presence>; now?: number }
  /** Other games (v2): same as `state`, the view depends on `game`. */
  | GameStateMessage
  | { v: number; type: 'error'; code: ErrorCode; message: string }
  | { v: number; type: 'pong'; t: number | null };

export type GameStateMessage =
  | { v: number; type: 'gameState'; game: 'aktivity'; view: AktivityRoomView; presence: Record<string, Presence>; now: number }
  | { v: number; type: 'gameState'; game: 'mjz'; view: MjzView; presence: Record<string, Presence>; now: number }
  | { v: number; type: 'gameState'; game: 'chess'; view: ChessRoomView; presence: Record<string, Presence>; now: number }
  | { v: number; type: 'gameState'; game: 'prsi-hra'; view: PrsiRoomView; presence: Record<string, Presence>; now: number }
  | { v: number; type: 'gameState'; game: 'zoliky-hra'; view: ZolikyRoomView; presence: Record<string, Presence>; now: number }
  | { v: number; type: 'gameState'; game: 'clovece'; view: CloveceRoomView; presence: Record<string, Presence>; now: number };

// ---------- views ----------

/** Aktivity view plus who is looking (like LiveView.viewer / me). */
export type AktivityRoomView = AktivityView & { viewer: Viewer['role']; me: string | null };

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

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function parseGoal(raw: unknown): AktivityGoal | null {
  if (!isObj(raw)) return null;
  if (raw.kind === 'points' && isInt(raw.points, 1, 1000)) return { kind: 'points', points: raw.points };
  if (raw.kind === 'rounds' && isInt(raw.rounds, 1, 1000)) return { kind: 'rounds', rounds: raw.rounds };
  return null;
}

/** „Řekni, ukaž, nakresli“ commands a client may send. */
export function parseAktivityCommand(raw: unknown): AktivityCommand | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'start':
    case 'skip':
    case 'next':
    case 'end':
      return { type: raw.type };
    case 'configure': {
      const out: Extract<AktivityCommand, { type: 'configure' }> = { type: 'configure' };
      if (raw.timerSeconds !== undefined) {
        if (!isInt(raw.timerSeconds, 1, 3600)) return null;
        out.timerSeconds = raw.timerSeconds;
      }
      if (raw.goal !== undefined) {
        const goal = parseGoal(raw.goal);
        if (!goal) return null;
        out.goal = goal;
      }
      if (raw.allPlayChance !== undefined) {
        if (typeof raw.allPlayChance !== 'number' || !Number.isFinite(raw.allPlayChance)) return null;
        out.allPlayChance = raw.allPlayChance;
      }
      return out;
    }
    case 'chooseDifficulty':
      return (DIFFICULTIES as readonly unknown[]).includes(raw.difficulty)
        ? { type: 'chooseDifficulty', difficulty: raw.difficulty as 3 | 4 | 5 }
        : null;
    case 'startTurn':
      if (raw.difficulty === undefined) return { type: 'startTurn' };
      return (DIFFICULTIES as readonly unknown[]).includes(raw.difficulty)
        ? { type: 'startTurn', difficulty: raw.difficulty as 3 | 4 | 5 }
        : null;
    case 'guessed':
      if (raw.teamId === undefined) return { type: 'guessed' };
      return isStr(raw.teamId) ? { type: 'guessed', teamId: raw.teamId } : null;
    default:
      return null;
  }
}

function parseCategories(raw: unknown): MjzCategory[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 12) return null;
  const out: MjzCategory[] = [];
  for (const c of raw) {
    if (!isObj(c) || !isStr(c.id, 32) || !isStr(c.label, 40)) return null;
    const hints = c.hints;
    if (hints !== undefined && (!Array.isArray(hints) || hints.length > 8 || !hints.every((h) => isStr(h, 32)))) return null;
    out.push({ id: c.id, label: c.label, ...(hints ? { hints: hints as string[] } : {}) });
  }
  return out;
}

function parseMjzSettings(raw: unknown): Partial<MjzSettings> | null {
  if (!isObj(raw)) return null;
  const out: Partial<MjzSettings> = {};
  if (raw.rounds !== undefined) {
    if (!isInt(raw.rounds, 1, 30)) return null;
    out.rounds = raw.rounds;
  }
  for (const key of ['timeSeconds', 'stopSeconds'] as const) {
    if (raw[key] === undefined) continue;
    if (!isInt(raw[key], 0, 600)) return null;
    out[key] = raw[key] as number;
  }
  for (const key of ['includeCh', 'kidsBonus'] as const) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'boolean') return null;
    out[key] = raw[key] as boolean;
  }
  if (raw.categories !== undefined) {
    const categories = parseCategories(raw.categories);
    if (!categories) return null;
    out.categories = categories;
  }
  return out;
}

/** „Město, jméno, zvíře“ commands a client may send. */
export function parseMjzCommand(raw: unknown): MjzCommand | null {
  if (!isObj(raw)) return null;
  const optContestant = raw.contestantId === undefined ? {} : isStr(raw.contestantId) ? { contestantId: raw.contestantId } : null;
  switch (raw.type) {
    case 'start':
    case 'redraw':
    case 'startWriting':
    case 'closeWriting':
    case 'next':
    case 'end':
      return { type: raw.type };
    case 'configure': {
      const settings = parseMjzSettings(raw.settings);
      return settings ? { type: 'configure', settings } : null;
    }
    case 'write': {
      if (!optContestant || !isObj(raw.answers)) return null;
      const entries = Object.entries(raw.answers);
      if (entries.length > 12) return null;
      const answers: Record<string, string> = {};
      for (const [k, val] of entries) {
        if (!isStr(k, 32) || typeof val !== 'string' || val.length > ANSWER_MAX * 2) return null;
        answers[k] = val;
      }
      return { type: 'write', answers, ...optContestant };
    }
    case 'stop':
    case 'done':
      return optContestant ? { type: raw.type, ...optContestant } : null;
    case 'focus':
      return isInt(raw.index, 0, 50) ? { type: 'focus', index: raw.index } : null;
    case 'challenge':
      return isStr(raw.contestantId) && isStr(raw.categoryId, 32)
        ? { type: 'challenge', contestantId: raw.contestantId, categoryId: raw.categoryId }
        : null;
    case 'vote':
      return isStr(raw.contestantId) && isStr(raw.categoryId, 32) && typeof raw.valid === 'boolean'
        ? { type: 'vote', contestantId: raw.contestantId, categoryId: raw.categoryId, valid: raw.valid }
        : null;
    case 'rule':
      return isStr(raw.contestantId) && isStr(raw.categoryId, 32) && (typeof raw.valid === 'boolean' || raw.valid === null)
        ? { type: 'rule', contestantId: raw.contestantId, categoryId: raw.categoryId, valid: raw.valid as boolean | null }
        : null;
    case 'kick':
      return isStr(raw.contestantId) ? { type: 'kick', contestantId: raw.contestantId } : null;
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
  if (!isSupportedVersion(raw.v)) {
    return { ok: false, code: 'version', message: `Nepodporovaná verze protokolu (server má ${PROTOCOL_VERSION}).` };
  }
  const v = raw.v as number;
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
      const game = raw.game ?? 'quiz';
      if (!isRoomGame(game)) return bad;
      if (game === 'aktivity') {
        const action = parseAktivityCommand(raw.action);
        return action ? { ok: true, message: { v, type: 'action', game, action } } : bad;
      }
      if (game === 'mjz') {
        const action = parseMjzCommand(raw.action);
        return action ? { ok: true, message: { v, type: 'action', game, action } } : bad;
      }
      if (game === 'chess') {
        const action = parseChessRoomCommand(raw.action);
        return action ? { ok: true, message: { v, type: 'action', game, action } } : bad;
      }
      if (game === 'prsi-hra') {
        const action = parsePrsiRoomCommand(raw.action);
        return action ? { ok: true, message: { v, type: 'action', game, action } } : bad;
      }
      if (game === 'clovece') {
        const action = parseCloveceRoomCommand(raw.action);
        return action ? { ok: true, message: { v, type: 'action', game, action } } : bad;
      }
      if (game === 'zoliky-hra') {
        const action = parseZolikyRoomCommand(raw.action);
        return action ? { ok: true, message: { v, type: 'action', game, action } } : bad;
      }
      const action = parseCommand(raw.action);
      if (!action) return bad;
      return { ok: true, message: raw.game === undefined ? { v, type: 'action', action } : { v, type: 'action', game: 'quiz', action } };
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
  wrongGame: 'V téhle místnosti se hraje jiná hra, obnov stránku.',
  invalidConfig: 'Neplatné nastavení hry.',
  invalidDifficulty: 'Obtížnost může být 3, 4 nebo 5.',
  noDifficulty: 'Nejdřív vyber obtížnost.',
  unknownTeam: 'Takový tým ve hře není.',
  deckEmpty: 'Došla slova pro tuhle úroveň.',
  timeUp: 'Čas už vypršel.',
  unknownCategory: 'Taková kategorie ve hře není.',
  invalidSettings: 'Neplatné nastavení hry.',
  alreadyDone: 'Už máš odevzdáno.',
  incomplete: 'Na Stop! musíš mít vyplněné všechno.',
  noLetters: 'Došla písmena.',
  notChallengeable: 'Tuhle odpověď napadnout nejde.',
  ownAnswer: 'O své odpovědi nehlasuješ.',
  notYourTurn: 'Počkej, teď hraje někdo jiný.',
  illegalMove: 'Takový tah nejde.',
  noOffer: 'Nikdo remízu nenabízí.',
  ownOffer: 'Vlastní nabídku remízy přijmout nemůžeš.',
  notInHand: 'Tuhle kartu nemáš v ruce.',
  mustAnswerSeven: 'Leží sedma. Můžeš dát jen sedmu, jinak bereš karty.',
  mustAnswerAce: 'Leží eso. Můžeš dát jen eso, jinak stojíš.',
  wrongCard: 'Karta musí mít stejnou barvu nebo stejnou hodnotu jako karta nahoře.',
  needSuit: 'Se svrškem musíš vybrat barvu.',
  oberOnOber: 'Svršek na svrška se v téhle hře nedává.',
  mustStand: 'Na eso se nebere, jen se stojí.',
  nothingToStand: 'Stát se dá jen na eso.',
  drawFirst: 'Nejdřív si vezmi kartu z balíčku nebo z odhozených.',
  alreadyDrew: 'Kartu už sis vzal. Teď vykládej, nebo jednu kartu odhoď.',
  emptyDiscard: 'Odhazovací hromádka je prázdná.',
  notOpened: 'Přikládat a měnit žolíky můžeš, až když sám poprvé vyložíš.',
  opening: 'Na první vyložení to ještě nestačí.',
  badMeld: 'Tahle skupina karet neplatí.',
  unknownMeld: 'Tahle skupina na stole není.',
  keepDiscard: 'Jednu kartu si musíš nechat na odhození — tou se zavírá.',
  sameDiscard: 'Kartu, kterou sis vzal z odhozených, nemůžeš hned zase odhodit.',
  mustUseDiscard: 'Kartu z odhozených sis vzal, tak ji musíš hned vyložit.',
  nothingToReset: 'Není co vracet.',
  rollFirst: 'Nejdřív hoď kostkou.',
  alreadyRolled: 'Už máš hozeno — vyber figurku.',
};

/** Error for a client; `message` replaces the standard text (e.g. the engine's detailed reason). */
export function errorMessage(code: ErrorCode, message?: string): ServerMessage {
  return { v: PROTOCOL_VERSION, type: 'error', code, message: message ?? ERROR_MESSAGES[code] };
}
