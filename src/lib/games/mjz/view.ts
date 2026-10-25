// What one screen may see of an MJZ game. While writing, nobody sees other people's answers —
// only how many fields each contestant has filled. Answers become public at review.

import type { Level } from '../../types.ts';
import {
  answerKey,
  categoriesFor,
  contestant,
  filledCount,
  isKicked,
  judgeAnswers,
  scoreAnswers,
  standings,
  type AnswerVerdict,
  type MjzCategory,
  type MjzPhase,
  type MjzSettings,
  type MjzStanding,
  type MjzState,
  type RoundResult,
  type ScoredAnswer,
} from './engine.ts';
import { isKnownAnswer, type HintIndex } from './hints.ts';

export const MJZ_VIEW_VERSION = 1;

export type MjzViewer = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'spectator' };

export interface MjzContestantView {
  id: string;
  name: string;
  avatar: string;
  level: Level;
  kicked: boolean;
  score: number;
  /** Non-empty answers on the sheet this round (never the answers themselves while writing). */
  filled: number;
  total: number;
  done: boolean;
  /** End of this contestant's writing time (epoch ms), null outside writing. */
  deadline: number | null;
  /** The host may write for this contestant. */
  assisted: boolean;
}

export interface MjzAnswerView {
  contestantId: string;
  categoryId: string;
  text: string;
  verdict: AnswerVerdict;
  decidedBy: ScoredAnswer['decidedBy'];
  /** Points if the round were scored now (final in roundEnd). */
  points: number;
  sharedWith: string[];
  /** Found in the hint lists; null = no hints for the category. */
  known: boolean | null;
  challenged: boolean;
  challengedBy: string | null;
  votesValid: number;
  votesInvalid: number;
  /** This viewer's vote (contestant only). */
  myVote: boolean | null;
  ruling: boolean | null;
}

export interface MjzView {
  v: number;
  game: 'mjz';
  viewer: MjzViewer['role'];
  me: string | null;
  id: string;
  phase: MjzPhase;
  roundIndex: number;
  roundCount: number;
  letter: string | null;
  categories: MjzCategory[];
  /** Categories this viewer writes (contestant) — subset of `categories`. */
  myCategories: string[];
  settings: Pick<MjzSettings, 'timeSeconds' | 'stopSeconds' | 'includeCh' | 'kidsBonus' | 'rounds'>;
  /** Latest end of writing; the TV countdown. */
  deadline: number | null;
  myDeadline: number | null;
  stoppedBy: string | null;
  stoppedAt: number | null;
  contestants: MjzContestantView[];
  /** Own sheet (contestant), or sheets the host writes for assisted contestants. */
  sheets: Record<string, Record<string, string>>;
  focus: number;
  /** Review and later: every answer of the current round. */
  answers: MjzAnswerView[] | null;
  lastResult: Pick<RoundResult, 'round' | 'letter' | 'stoppedBy' | 'basePoints' | 'points'> | null;
  standings: MjzStanding[];
}

export interface ViewOptions {
  hints?: HintIndex;
}

function answersView(state: MjzState, viewer: MjzViewer, hints: HintIndex | undefined): MjzAnswerView[] {
  const scored = state.phase === 'review' ? scoreAnswers(judgeAnswers(state)) : (state.results.at(-1)?.answers ?? []);
  const categories = new Map(state.settings.categories.map((c) => [c.id, c]));
  const me = viewer.role === 'contestant' ? viewer.contestantId : null;
  return scored.map((a) => {
    const key = answerKey(a.contestantId, a.categoryId);
    const ch = state.challenges[key];
    const votes = ch ? Object.values(ch.votes) : [];
    return {
      contestantId: a.contestantId,
      categoryId: a.categoryId,
      text: a.text,
      verdict: a.verdict,
      decidedBy: a.decidedBy,
      points: a.points,
      sharedWith: a.sharedWith,
      known: a.text ? isKnownAnswer(hints, categories.get(a.categoryId), a.text) : null,
      challenged: !!ch,
      challengedBy: ch?.by ?? null,
      votesValid: votes.filter(Boolean).length,
      votesInvalid: votes.filter((v) => !v).length,
      myVote: me && ch && me in ch.votes ? ch.votes[me] : null,
      ruling: key in state.rulings ? state.rulings[key] : null,
    };
  });
}

export function viewFor(state: MjzState, viewer: MjzViewer, options: ViewOptions = {}): MjzView {
  const me = viewer.role === 'contestant' && contestant(state, viewer.contestantId) ? viewer.contestantId : null;
  const writing = state.phase === 'writing';
  const sheets: Record<string, Record<string, string>> = {};
  if (writing || state.phase === 'letter') {
    if (me && state.sheets[me]) sheets[me] = { ...state.sheets[me] };
    if (viewer.role === 'host') {
      for (const c of state.contestants) {
        if (state.settings.levelRules[c.level]?.assisted && state.sheets[c.id]) sheets[c.id] = { ...state.sheets[c.id] };
      }
    }
  }
  const meC = me ? contestant(state, me) : undefined;
  const last = state.results.at(-1);
  const showAnswers = state.phase === 'review' || ((state.phase === 'roundEnd' || state.phase === 'finished') && !!last);
  return {
    v: MJZ_VIEW_VERSION,
    game: 'mjz',
    viewer: viewer.role,
    me,
    id: state.id,
    phase: state.phase,
    roundIndex: state.roundIndex,
    roundCount: state.settings.rounds,
    letter: state.phase === 'setup' ? null : state.letter,
    categories: state.settings.categories.map((c) => ({ ...c })),
    myCategories: meC ? categoriesFor(state, meC).map((c) => c.id) : [],
    settings: {
      timeSeconds: state.settings.timeSeconds,
      stopSeconds: state.settings.stopSeconds,
      includeCh: state.settings.includeCh,
      kidsBonus: state.settings.kidsBonus,
      rounds: state.settings.rounds,
    },
    deadline: writing ? state.deadline : null,
    myDeadline: writing && me ? (state.deadlines[me] ?? null) : null,
    stoppedBy: state.stoppedBy,
    stoppedAt: state.stoppedAt,
    contestants: state.contestants.map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      level: c.level,
      kicked: isKicked(state, c.id),
      score: state.scores[c.id] ?? 0,
      filled: filledCount(state, c.id),
      total: categoriesFor(state, c).length,
      done: state.done.includes(c.id),
      deadline: writing ? (state.deadlines[c.id] ?? null) : null,
      assisted: state.settings.levelRules[c.level]?.assisted ?? false,
    })),
    sheets,
    focus: state.focus,
    answers: showAnswers ? answersView(state, viewer, options.hints) : null,
    lastResult: last && state.phase !== 'review' && state.phase !== 'writing' && state.phase !== 'letter'
      ? { round: last.round, letter: last.letter, stoppedBy: last.stoppedBy, basePoints: last.basePoints, points: last.points }
      : null,
    standings: standings(state),
  };
}
