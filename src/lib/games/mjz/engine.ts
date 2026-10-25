// "Město, jméno, zvíře" (MJZ) as a pure reducer for the TV + phones mode.
//
// A round: a letter is drawn (from the seed, never repeated), everyone writes one answer per
// category on their phone, the round ends when someone presses "Stop!" (the others get
// `stopSeconds` more) or the time runs out. Then the TV shows the answers per category, players
// challenge and vote on doubtful ones, the host has the last word, and the round is scored.
//
// The state is plain JSON. Time never comes from the clock here: every action carries `now`
// (epoch ms) and the server sends `timeout` once `deadline` has passed. Rules: README.md.

import type { Level } from '../../types.ts';
import type { Contestant } from '../../engine/select.ts';
import { mulberry32, shuffle } from '../../engine/rng.ts';
import type { MatchResult } from '../../league/types.ts';

export const MJZ_STATE_VERSION = 1;
/** Longest accepted answer (characters). */
export const ANSWER_MAX = 40;

/** Czech letters a word may start with in this game: no Q, W, X, Y, nothing with háček/čárka. */
export const BASE_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'R', 'S', 'T', 'U', 'V', 'Z',
] as const;
export const CH = 'Ch';

export const POINTS = { unique: 10, shared: 5, alone: 20, none: 0 } as const;

export interface MjzCategory {
  id: string;
  label: string;
  /** Keys of hint files in data/mjz/hints/ used to mark answers as known. */
  hints?: string[];
}

export const ADULT_CATEGORIES: MjzCategory[] = [
  { id: 'mesto', label: 'Město', hints: ['mesta'] },
  { id: 'jmeno', label: 'Jméno', hints: ['jmena'] },
  { id: 'zvire', label: 'Zvíře', hints: ['zvirata'] },
  { id: 'vec', label: 'Věc' },
  { id: 'rostlina', label: 'Rostlina', hints: ['rostliny'] },
  { id: 'reka-hora', label: 'Řeka/Hora', hints: ['reky', 'hory'] },
];

export const KIDS_CATEGORIES: MjzCategory[] = [
  { id: 'jmeno', label: 'Jméno', hints: ['jmena'] },
  { id: 'zvire', label: 'Zvíře', hints: ['zvirata'] },
  { id: 'vec', label: 'Věc' },
  { id: 'jidlo', label: 'Jídlo', hints: ['jidlo'] },
  { id: 'barva-hracka', label: 'Barva/Hračka', hints: ['barvy'] },
];

export interface LevelRule {
  /** Extra writing time on top of `timeSeconds`. */
  extraSeconds: number;
  /** Subset of category ids this level writes; null = all categories. */
  categoryIds: string[] | null;
  /** The host may write the sheet for this contestant (an adult helps a preschooler). */
  assisted: boolean;
}

export interface MjzSettings {
  rounds: number;
  /** Writing time per round in seconds. */
  timeSeconds: number;
  /** Time the others get after someone presses Stop. */
  stopSeconds: number;
  categories: MjzCategory[];
  /** "Ch" may be drawn as its own letter. */
  includeCh: boolean;
  /** Lavice (1st grade) round points ×1.5, rounded up. */
  kidsBonus: boolean;
  levelRules: Record<Level, LevelRule>;
}

export const DEFAULT_SETTINGS: MjzSettings = {
  rounds: 5,
  timeSeconds: 90,
  stopSeconds: 10,
  categories: ADULT_CATEGORIES,
  includeCh: false,
  kidsBonus: false,
  levelRules: {
    hospoda: { extraSeconds: 0, categoryIds: null, assisted: false },
    lavice: { extraSeconds: 30, categoryIds: null, assisted: false },
    piskoviste: { extraSeconds: 60, categoryIds: null, assisted: true },
  },
};

export type MjzPhase = 'setup' | 'letter' | 'writing' | 'review' | 'roundEnd' | 'finished';

/** Doubt about one answer during review. */
export interface Challenge {
  /** Contestant id, or 'host'. */
  by: string;
  /** Voter id → considers the answer valid. */
  votes: Record<string, boolean>;
}

export type AnswerVerdict = 'empty' | 'wrongLetter' | 'valid' | 'invalid';

export interface ScoredAnswer {
  contestantId: string;
  categoryId: string;
  text: string;
  normalized: string;
  verdict: AnswerVerdict;
  /** How the verdict came about. */
  decidedBy: 'auto' | 'vote' | 'host';
  /** Other contestants with the same valid answer. */
  sharedWith: string[];
  points: number;
}

export interface RoundResult {
  round: number;
  letter: string;
  stoppedBy: string | null;
  answers: ScoredAnswer[];
  /** Points before the kids bonus. */
  basePoints: Record<string, number>;
  points: Record<string, number>;
}

export interface MjzState {
  game: 'mjz';
  version: number;
  id: string;
  createdAt: string;
  seed: number;
  settings: MjzSettings;
  contestants: Contestant[];
  kicked: string[];
  phase: MjzPhase;
  /** 0-based index of the current round. */
  roundIndex: number;
  /** Letter order drawn from the seed; letters are taken from the front. */
  letterOrder: string[];
  /** Letters used so far (drawn or skipped by redraw). */
  usedLetters: string[];
  letter: string | null;
  /** Epoch ms when writing started. */
  startedAt: number | null;
  /** Per-contestant end of writing (own time limit, shortened by Stop). */
  deadlines: Record<string, number>;
  /** Latest deadline of anyone still writing; the server sends `timeout` then. */
  deadline: number | null;
  stoppedBy: string | null;
  stoppedAt: number | null;
  /** Contestants who locked their sheet. */
  done: string[];
  /** contestantId → categoryId → answer of the current round. */
  sheets: Record<string, Record<string, string>>;
  /** `${contestantId}|${categoryId}` → challenge of the current review. */
  challenges: Record<string, Challenge>;
  /** `${contestantId}|${categoryId}` → host's final word (true = valid). */
  rulings: Record<string, boolean>;
  /** Category the TV focuses on during review. */
  focus: number;
  results: RoundResult[];
  scores: Record<string, number>;
}

export type Actor = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'system' };

export type MjzCommand =
  | { type: 'configure'; settings: Partial<MjzSettings> }
  | { type: 'start' }
  | { type: 'redraw' }
  | { type: 'startWriting' }
  | { type: 'write'; answers: Record<string, string>; contestantId?: string }
  | { type: 'stop'; contestantId?: string }
  | { type: 'done'; contestantId?: string }
  | { type: 'closeWriting' }
  | { type: 'timeout' }
  | { type: 'focus'; index: number }
  | { type: 'challenge'; contestantId: string; categoryId: string }
  | { type: 'vote'; contestantId: string; categoryId: string; valid: boolean }
  | { type: 'rule'; contestantId: string; categoryId: string; valid: boolean | null }
  | { type: 'next' }
  | { type: 'end' }
  | { type: 'kick'; contestantId: string };

export type MjzAction = MjzCommand & { by: Actor; now: number };

export type MjzError =
  | 'forbidden'
  | 'wrongPhase'
  | 'unknownContestant'
  | 'unknownCategory'
  | 'invalidAnswer'
  | 'invalidSettings'
  | 'timeUp'
  | 'alreadyDone'
  | 'incomplete'
  | 'notYet'
  | 'noLetters'
  | 'notChallengeable'
  | 'ownAnswer';

export type MjzResult = { ok: true; state: MjzState } | { ok: false; error: MjzError; state: MjzState };

export interface CreateMjzInput {
  id?: string;
  createdAt?: string;
  seed: number;
  contestants: Contestant[];
  settings?: Partial<MjzSettings>;
}

// ---------- letters and normalization ----------

/** Letters available with the given settings (Ch after H, as in the Czech alphabet). */
export function alphabet(includeCh: boolean): string[] {
  const out: string[] = [];
  for (const l of BASE_LETTERS) {
    out.push(l);
    if (l === 'H' && includeCh) out.push(CH);
  }
  return out;
}

/** Deterministic letter order for a seed. */
export function drawLetters(seed: number, includeCh: boolean): string[] {
  return shuffle(alphabet(includeCh), mulberry32(seed ^ 0x6d6a7a));
}

const SEPARATORS = /[\s\-–.,'’"]+/g;

/** Comparison key: no diacritics, no case, no spaces or punctuation. */
export function normalizeAnswer(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(SEPARATORS, '');
}

/** Trimmed answer with single spaces, as stored. */
export function cleanAnswer(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ');
}

// Acute and ring marks do not make a separate Czech letter (Á sorts as A); háček does (Č ≠ C).
const SAME_LETTER: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ů: 'u', ý: 'y' };

/** Does the answer start with the drawn letter? With Ch in play, "ch…" words belong to Ch only. */
export function startsWithLetter(text: string, letter: string, includeCh: boolean): boolean {
  const t = cleanAnswer(text).toLowerCase();
  if (!t) return false;
  const l = letter.toLowerCase();
  if (l === 'ch') return t.startsWith('ch');
  if (l === 'c' && includeCh && t.startsWith('ch')) return false;
  const first = t[0];
  return (SAME_LETTER[first] ?? first) === l;
}

// ---------- selectors ----------

export const answerKey = (contestantId: string, categoryId: string) => `${contestantId}|${categoryId}`;

export function contestant(state: MjzState, id: string): Contestant | undefined {
  return state.contestants.find((c) => c.id === id);
}

export function isKicked(state: MjzState, id: string): boolean {
  return state.kicked.includes(id);
}

export function activeContestants(state: MjzState): Contestant[] {
  return state.contestants.filter((c) => !isKicked(state, c.id));
}

/** Categories a contestant writes (level rule subset, in settings order). */
export function categoriesFor(state: MjzState, c: Contestant): MjzCategory[] {
  const ids = state.settings.levelRules[c.level]?.categoryIds;
  return ids ? state.settings.categories.filter((cat) => ids.includes(cat.id)) : state.settings.categories;
}

export function writingSecondsFor(settings: MjzSettings, level: Level): number {
  return settings.timeSeconds + (settings.levelRules[level]?.extraSeconds ?? 0);
}

/** Number of non-empty answers on a contestant's sheet. */
export function filledCount(state: MjzState, contestantId: string): number {
  const c = contestant(state, contestantId);
  if (!c) return 0;
  const sheet = state.sheets[contestantId] ?? {};
  return categoriesFor(state, c).filter((cat) => (sheet[cat.id] ?? '') !== '').length;
}

/**
 * Verdict of every answer of the current round as it stands now (live during review).
 * Order of precedence: empty / wrong letter (automatic 0) → host ruling → majority of votes
 * (a tie keeps the answer) → valid.
 */
export function judgeAnswers(state: MjzState): ScoredAnswer[] {
  const letter = state.letter ?? '';
  const list: ScoredAnswer[] = [];
  for (const cat of state.settings.categories) {
    for (const c of activeContestants(state)) {
      if (!categoriesFor(state, c).some((x) => x.id === cat.id)) continue;
      const text = state.sheets[c.id]?.[cat.id] ?? '';
      const key = answerKey(c.id, cat.id);
      let verdict: AnswerVerdict;
      let decidedBy: ScoredAnswer['decidedBy'] = 'auto';
      if (text === '') verdict = 'empty';
      else if (!startsWithLetter(text, letter, state.settings.includeCh)) verdict = 'wrongLetter';
      else if (key in state.rulings) {
        verdict = state.rulings[key] ? 'valid' : 'invalid';
        decidedBy = 'host';
      } else if (state.challenges[key]) {
        const votes = Object.values(state.challenges[key].votes);
        const against = votes.filter((v) => !v).length;
        verdict = against > votes.length - against ? 'invalid' : 'valid';
        decidedBy = 'vote';
      } else verdict = 'valid';
      list.push({ contestantId: c.id, categoryId: cat.id, text, normalized: normalizeAnswer(text), verdict, decidedBy, sharedWith: [], points: 0 });
    }
  }
  return list;
}

/** Points per answer: 20 if the only valid answer in the category, 10 unique, 5 shared, 0 otherwise. */
export function scoreAnswers(answers: ScoredAnswer[]): ScoredAnswer[] {
  const byCategory = new Map<string, ScoredAnswer[]>();
  for (const a of answers) {
    if (a.verdict !== 'valid') continue;
    const list = byCategory.get(a.categoryId) ?? [];
    list.push(a);
    byCategory.set(a.categoryId, list);
  }
  return answers.map((a) => {
    if (a.verdict !== 'valid') return { ...a, sharedWith: [], points: POINTS.none };
    const valid = byCategory.get(a.categoryId)!;
    const sharedWith = valid.filter((o) => o !== a && o.normalized === a.normalized).map((o) => o.contestantId);
    const points = valid.length === 1 ? POINTS.alone : sharedWith.length > 0 ? POINTS.shared : POINTS.unique;
    return { ...a, sharedWith, points };
  });
}

export function applyKidsBonus(points: number, level: Level, kidsBonus: boolean): number {
  return kidsBonus && level === 'lavice' ? Math.ceil(points * 1.5) : points;
}

function roundResult(state: MjzState): RoundResult {
  const answers = scoreAnswers(judgeAnswers(state));
  const basePoints: Record<string, number> = {};
  const points: Record<string, number> = {};
  for (const c of activeContestants(state)) {
    basePoints[c.id] = answers.filter((a) => a.contestantId === c.id).reduce((s, a) => s + a.points, 0);
    points[c.id] = applyKidsBonus(basePoints[c.id], c.level, state.settings.kidsBonus);
  }
  return { round: state.roundIndex, letter: state.letter ?? '', stoppedBy: state.stoppedBy, answers, basePoints, points };
}

export interface MjzStanding {
  contestantId: string;
  score: number;
  /** Competition ranking (1, 1, 3). */
  place: number;
}

export function standings(state: MjzState): MjzStanding[] {
  const rows = state.contestants
    .map((c, order) => ({ contestantId: c.id, score: state.scores[c.id] ?? 0, order }))
    .sort((a, b) => b.score - a.score || a.order - b.order);
  return rows.map((r) => ({
    contestantId: r.contestantId,
    score: r.score,
    place: rows.findIndex((o) => o.score === r.score) + 1,
  }));
}

/** League input. `MatchResult.gameType` has no 'mjz' yet, so the type is widened here. */
export type MjzMatchResult = Omit<MatchResult, 'gameType'> & { gameType: 'mjz' };

export function toMatchResult(
  state: MjzState,
  meta: { matchId?: string; playedAt?: string; nightId?: string | null } = {},
): MjzMatchResult {
  const seats = new Map(state.contestants.map((c) => [c.id, c]));
  return {
    matchId: meta.matchId ?? state.id,
    gameType: 'mjz',
    playedAt: meta.playedAt ?? state.createdAt,
    nightId: meta.nightId ?? null,
    participants: standings(state).map((s) => {
      const memberIds = seats.get(s.contestantId)?.memberIds ?? [];
      const ids = memberIds.length ? memberIds : [s.contestantId];
      return {
        participantId: s.contestantId,
        kind: ids.length > 1 || ids[0] !== s.contestantId ? 'team' : 'player',
        memberIds: ids,
        place: s.place,
        score: s.score,
      };
    }),
  };
}

// ---------- creation ----------

function validSettings(s: MjzSettings): boolean {
  const ids = s.categories.map((c) => c.id);
  const letters = alphabet(s.includeCh).length;
  return (
    Number.isInteger(s.rounds) && s.rounds >= 1 && s.rounds <= letters &&
    Number.isFinite(s.timeSeconds) && s.timeSeconds >= 10 && s.timeSeconds <= 600 &&
    Number.isFinite(s.stopSeconds) && s.stopSeconds >= 0 && s.stopSeconds <= 60 &&
    s.categories.length >= 1 && s.categories.length <= 12 && new Set(ids).size === ids.length &&
    s.categories.every((c) => typeof c.id === 'string' && c.id !== '' && typeof c.label === 'string' && c.label !== '') &&
    Object.values(s.levelRules).every(
      (r) => r.extraSeconds >= 0 && r.extraSeconds <= 600 && (r.categoryIds === null || r.categoryIds.some((id) => ids.includes(id))),
    )
  );
}

function mergeSettings(base: MjzSettings, patch: Partial<MjzSettings>): MjzSettings {
  return {
    ...base,
    ...patch,
    categories: (patch.categories ?? base.categories).map((c) => ({ ...c })),
    levelRules: { ...base.levelRules, ...(patch.levelRules ?? {}) },
  };
}

export function createMjzGame(input: CreateMjzInput): MjzState {
  const settings = mergeSettings(DEFAULT_SETTINGS, input.settings ?? {});
  if (!validSettings(settings)) throw new Error('[mjz] invalid settings');
  return {
    game: 'mjz',
    version: MJZ_STATE_VERSION,
    id: input.id ?? `mjz-${(input.seed >>> 0).toString(36)}`,
    createdAt: input.createdAt ?? new Date(0).toISOString(),
    seed: input.seed >>> 0,
    settings,
    contestants: input.contestants.map((c) => ({ ...c, memberIds: c.memberIds.slice() })),
    kicked: [],
    phase: 'setup',
    roundIndex: 0,
    letterOrder: drawLetters(input.seed >>> 0, settings.includeCh),
    usedLetters: [],
    letter: null,
    startedAt: null,
    deadlines: {},
    deadline: null,
    stoppedBy: null,
    stoppedAt: null,
    done: [],
    sheets: {},
    challenges: {},
    rulings: {},
    focus: 0,
    results: [],
    scores: Object.fromEntries(input.contestants.map((c) => [c.id, 0])),
  };
}

// ---------- transitions ----------

function nextLetter(state: MjzState): string | undefined {
  return state.letterOrder.find((l) => !state.usedLetters.includes(l));
}

function enterLetter(state: MjzState): MjzState | null {
  const letter = nextLetter(state);
  if (!letter) return null;
  return {
    ...state,
    phase: 'letter',
    letter,
    usedLetters: [...state.usedLetters, letter],
    startedAt: null,
    deadlines: {},
    deadline: null,
    stoppedBy: null,
    stoppedAt: null,
    done: [],
    sheets: {},
    challenges: {},
    rulings: {},
    focus: 0,
  };
}

/** Recomputes the global deadline; everyone done (or nobody left) → review. */
function settleWriting(state: MjzState, now: number): MjzState {
  const writing = activeContestants(state).filter((c) => !state.done.includes(c.id));
  if (writing.length === 0) return toReview(state);
  const open = writing.map((c) => state.deadlines[c.id]).filter((d) => d > now);
  if (open.length === 0) return { ...state, deadline: Math.max(...writing.map((c) => state.deadlines[c.id])) };
  return { ...state, deadline: Math.max(...open) };
}

function toReview(state: MjzState): MjzState {
  return { ...state, phase: 'review', deadline: null, focus: 0 };
}

/** Who writes the sheet: the contestant, or the host for an assisted contestant. */
function writerTarget(state: MjzState, by: Actor, requested: string | undefined): { id: string } | { error: MjzError } {
  if (by.role === 'contestant') {
    if (requested !== undefined && requested !== by.contestantId) return { error: 'forbidden' };
    return { id: by.contestantId };
  }
  if (by.role !== 'host' || requested === undefined) return { error: 'forbidden' };
  const c = contestant(state, requested);
  if (!c || isKicked(state, c.id)) return { error: 'unknownContestant' };
  return state.settings.levelRules[c.level]?.assisted ? { id: c.id } : { error: 'forbidden' };
}

function canWrite(state: MjzState, id: string, now: number): MjzError | null {
  if (state.phase !== 'writing') return 'wrongPhase';
  if (state.done.includes(id)) return 'alreadyDone';
  if (now >= (state.deadlines[id] ?? 0)) return 'timeUp';
  return null;
}

/** Answer in review that may be challenged/voted on: written and with the right letter. */
function reviewable(state: MjzState, contestantId: string, categoryId: string): MjzError | null {
  const c = contestant(state, contestantId);
  if (!c || isKicked(state, contestantId)) return 'unknownContestant';
  if (!categoriesFor(state, c).some((cat) => cat.id === categoryId)) return 'unknownCategory';
  const text = state.sheets[contestantId]?.[categoryId] ?? '';
  if (!text || !startsWithLetter(text, state.letter ?? '', state.settings.includeCh)) return 'notChallengeable';
  return null;
}

// ---------- reducer ----------

const fail = (state: MjzState, error: MjzError): MjzResult => ({ ok: false, error, state });
const ok = (state: MjzState): MjzResult => ({ ok: true, state });
const isHost = (a: Actor) => a.role === 'host';

/** Applies an action and says why it was refused. Never mutates `state`. */
export function applyMjz(state: MjzState, action: MjzAction): MjzResult {
  const { by, now } = action;
  if (action.type !== 'timeout' && by.role === 'system') return fail(state, 'forbidden');
  if (by.role === 'contestant' && (!contestant(state, by.contestantId) || isKicked(state, by.contestantId))) {
    return fail(state, 'forbidden');
  }

  switch (action.type) {
    case 'configure': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'setup') return fail(state, 'wrongPhase');
      const settings = mergeSettings(state.settings, action.settings ?? {});
      if (!validSettings(settings)) return fail(state, 'invalidSettings');
      return ok({ ...state, settings, letterOrder: drawLetters(state.seed, settings.includeCh) });
    }
    case 'start': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'setup') return fail(state, 'wrongPhase');
      if (activeContestants(state).length === 0) return fail(state, 'unknownContestant');
      return ok(enterLetter(state) ?? { ...state, phase: 'finished' });
    }
    case 'redraw': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'letter') return fail(state, 'wrongPhase');
      const next = enterLetter(state);
      return next ? ok(next) : fail(state, 'noLetters');
    }
    case 'startWriting': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'letter') return fail(state, 'wrongPhase');
      const deadlines: Record<string, number> = {};
      const sheets: Record<string, Record<string, string>> = {};
      for (const c of activeContestants(state)) {
        deadlines[c.id] = now + writingSecondsFor(state.settings, c.level) * 1000;
        sheets[c.id] = Object.fromEntries(categoriesFor(state, c).map((cat) => [cat.id, '']));
      }
      return ok(settleWriting({ ...state, phase: 'writing', startedAt: now, deadlines, sheets, done: [] }, now));
    }
    case 'write': {
      const writer = writerTarget(state, by, action.contestantId);
      if ('error' in writer) return fail(state, writer.error);
      const target = writer.id;
      const blocked = canWrite(state, target, now);
      if (blocked) return fail(state, blocked);
      const c = contestant(state, target)!;
      const allowed = new Set(categoriesFor(state, c).map((cat) => cat.id));
      if (!action.answers || typeof action.answers !== 'object') return fail(state, 'invalidAnswer');
      const sheet = { ...state.sheets[target] };
      for (const [categoryId, value] of Object.entries(action.answers)) {
        if (!allowed.has(categoryId)) return fail(state, 'unknownCategory');
        if (typeof value !== 'string') return fail(state, 'invalidAnswer');
        const text = cleanAnswer(value);
        if (text.length > ANSWER_MAX) return fail(state, 'invalidAnswer');
        sheet[categoryId] = text;
      }
      return ok({ ...state, sheets: { ...state.sheets, [target]: sheet } });
    }
    case 'stop':
    case 'done': {
      const writer = writerTarget(state, by, action.contestantId);
      if ('error' in writer) return fail(state, writer.error);
      const target = writer.id;
      const blocked = canWrite(state, target, now);
      if (blocked) return fail(state, blocked);
      const c = contestant(state, target)!;
      let next: MjzState = { ...state, done: [...state.done, target] };
      // Only the first Stop shortens the time; later ones just lock the sheet.
      if (action.type === 'stop' && state.stoppedBy === null) {
        if (filledCount(state, target) < categoriesFor(state, c).length) return fail(state, 'incomplete');
        const limit = now + state.settings.stopSeconds * 1000;
        const deadlines = Object.fromEntries(Object.entries(state.deadlines).map(([id, d]) => [id, Math.min(d, limit)]));
        next = { ...next, stoppedBy: target, stoppedAt: now, deadlines };
      }
      return ok(settleWriting(next, now));
    }
    case 'closeWriting':
    case 'timeout': {
      if (action.type === 'closeWriting' ? !isHost(by) : by.role !== 'system') return fail(state, 'forbidden');
      if (state.phase !== 'writing') return fail(state, 'wrongPhase');
      if (action.type === 'timeout' && (state.deadline === null || now < state.deadline)) return fail(state, 'notYet');
      return ok(toReview(state));
    }
    case 'focus': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'review') return fail(state, 'wrongPhase');
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.settings.categories.length) {
        return fail(state, 'unknownCategory');
      }
      return ok({ ...state, focus: action.index });
    }
    case 'challenge': {
      if (state.phase !== 'review') return fail(state, 'wrongPhase');
      const bad = reviewable(state, action.contestantId, action.categoryId);
      if (bad) return fail(state, bad);
      if (by.role === 'contestant' && by.contestantId === action.contestantId) return fail(state, 'ownAnswer');
      const key = answerKey(action.contestantId, action.categoryId);
      if (state.challenges[key]) return ok(state);
      const challenger = by.role === 'contestant' ? by.contestantId : 'host';
      // The challenger's own vote is "invalid".
      const votes: Record<string, boolean> = by.role === 'contestant' ? { [by.contestantId]: false } : {};
      return ok({ ...state, challenges: { ...state.challenges, [key]: { by: challenger, votes } } });
    }
    case 'vote': {
      if (by.role !== 'contestant') return fail(state, 'forbidden');
      if (state.phase !== 'review') return fail(state, 'wrongPhase');
      const bad = reviewable(state, action.contestantId, action.categoryId);
      if (bad) return fail(state, bad);
      if (by.contestantId === action.contestantId) return fail(state, 'ownAnswer');
      const key = answerKey(action.contestantId, action.categoryId);
      const ch = state.challenges[key];
      if (!ch) return fail(state, 'notChallengeable');
      const challenges = { ...state.challenges, [key]: { ...ch, votes: { ...ch.votes, [by.contestantId]: action.valid === true } } };
      return ok({ ...state, challenges });
    }
    case 'rule': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'review') return fail(state, 'wrongPhase');
      const bad = reviewable(state, action.contestantId, action.categoryId);
      if (bad) return fail(state, bad);
      const key = answerKey(action.contestantId, action.categoryId);
      const rulings = { ...state.rulings };
      if (action.valid === null) delete rulings[key];
      else rulings[key] = action.valid === true;
      return ok({ ...state, rulings });
    }
    case 'next': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase === 'review') {
        const result = roundResult(state);
        const scores = { ...state.scores };
        for (const [id, p] of Object.entries(result.points)) scores[id] = (scores[id] ?? 0) + p;
        return ok({ ...state, phase: 'roundEnd', results: [...state.results, result], scores });
      }
      if (state.phase === 'roundEnd') {
        if (state.roundIndex + 1 >= state.settings.rounds) return ok({ ...state, phase: 'finished' });
        const next = enterLetter({ ...state, roundIndex: state.roundIndex + 1 });
        return ok(next ?? { ...state, phase: 'finished' });
      }
      return fail(state, 'wrongPhase');
    }
    case 'end': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase !== 'roundEnd' && state.phase !== 'setup') return fail(state, 'wrongPhase');
      return ok({ ...state, phase: 'finished', deadline: null });
    }
    case 'kick': {
      if (!isHost(by)) return fail(state, 'forbidden');
      if (state.phase === 'finished') return fail(state, 'wrongPhase');
      if (!contestant(state, action.contestantId)) return fail(state, 'unknownContestant');
      if (isKicked(state, action.contestantId)) return ok(state);
      const next: MjzState = { ...state, kicked: [...state.kicked, action.contestantId] };
      return ok(next.phase === 'writing' ? settleWriting(next, now) : next);
    }
    default:
      return fail(state, 'wrongPhase');
  }
}

/** Reducer form: refused actions leave the state unchanged. */
export function reduceMjz(state: MjzState, action: MjzAction): MjzState {
  return applyMjz(state, action).state;
}
