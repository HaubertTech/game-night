// Levels v2 (docs/UROVNE.md): level order and mapping, theme fallback, point / imitate questions
// in the tablet and the live engine, timers per level and the level rules of the other games.

import { describe, expect, it } from 'vitest';
import {
  LEVELS,
  LEVEL_THEMES,
  LEVEL_TYPES,
  THEMES,
  hasOptions,
  isChildLevel,
  isJudged,
  levelRank,
  nearestLevel,
  type Question,
  type Theme,
} from '../src/lib/types.ts';
import {
  createGame,
  currentQuestion,
  levelTimer,
  reduce,
  timerFor,
  type Contestant,
  type GameState,
} from '../src/lib/engine/quiz.ts';
import { IMITATE_DONE, IMITATE_FAILED, applyLive, createLiveGame, liveTimerFor, stepTurn, type LiveState } from '../src/lib/engine/live.ts';
import { viewFor } from '../src/lib/live/protocol.ts';
import { cardLevelFor, modesForLevel } from '../src/lib/games/aktivity/types.ts';
import { createAktivity } from '../src/lib/games/aktivity/engine.ts';
import type { AktivityCard } from '../src/lib/games/aktivity/types.ts';
import { DEFAULT_SETTINGS, KIDS_CATEGORIES, MJZ_LEVELS, applyKidsBonus, writingSecondsFor } from '../src/lib/games/mjz/engine.ts';
import { hintProfile } from '../src/lib/games/chess/learn/hints.ts';
import { act, HOST, as, makePool } from './live/helpers.ts';

const fixtures = import.meta.glob<Question[]>('./fixtures/questions/**/*.json', { eager: true, import: 'default' });
const pool = Object.values(fixtures).flat();

const family: Contestant[] = [
  { id: 'emma', name: 'Ema', avatar: '🐰', level: 'kocarek', memberIds: ['emma'] },
  { id: 'vojta', name: 'Vojta', avatar: '🦊', level: 'prvnacek', memberIds: ['vojta'] },
  { id: 'tata', name: 'Táta', avatar: '🐻', level: 'hospoda', memberIds: ['tata'] },
];

function newGame(contestants = family, themes: Theme[] = ['priroda']): GameState {
  return createGame({ seed: 5, themes, questionsPerContestant: 2, timerSeconds: 30, contestants }, pool);
}

describe('level order and mapping', () => {
  it('orders levels from the youngest', () => {
    expect(LEVELS).toEqual(['kocarek', 'piskoviste', 'prvnacek', 'lavice', 'hospoda']);
    expect(levelRank('kocarek')).toBe(0);
    expect(levelRank('hospoda')).toBe(4);
    expect(levelRank('neznamo')).toBe(4);
  });

  it('finds the nearest level and prefers the younger one on a tie', () => {
    expect(nearestLevel('prvnacek', ['prvnacek', 'lavice'])).toBe('prvnacek');
    expect(nearestLevel('prvnacek', ['piskoviste', 'lavice', 'hospoda'])).toBe('piskoviste');
    expect(nearestLevel('prvnacek', ['lavice', 'hospoda'])).toBe('lavice');
    expect(nearestLevel('kocarek', ['hospoda', 'piskoviste', 'lavice'])).toBe('piskoviste');
    expect(nearestLevel('hospoda', [])).toBeNull();
  });

  it('marks the children levels', () => {
    expect(LEVELS.filter(isChildLevel)).toEqual(['kocarek', 'piskoviste', 'prvnacek']);
  });

  it('keeps every level theme list within THEMES', () => {
    for (const level of LEVELS) for (const t of LEVEL_THEMES[level]) expect(THEMES).toContain(t);
    expect(LEVEL_THEMES.kocarek).not.toContain('dejiny');
    expect(LEVEL_THEMES.prvnacek).toEqual(THEMES);
    expect(LEVEL_TYPES.kocarek).toEqual(['point', 'imitate']);
  });

  it('classifies question types', () => {
    const point = pool.find((q) => q.type === 'point')!;
    const imitate = pool.find((q) => q.type === 'imitate')!;
    expect(hasOptions(point)).toBe(true);
    expect(isJudged(point)).toBe(false);
    expect(hasOptions(imitate)).toBe(false);
    expect(isJudged(imitate)).toBe(true);
  });
});

describe('theme fallback', () => {
  it('gives kocarek a question of its own themes in a round it has none for', () => {
    const g = newGame([family[0]], ['dejiny']);
    const turns = g.rounds[0].turns;
    expect(turns).toHaveLength(2);
    for (const t of turns) {
      const q = g.questions[t.questionId];
      expect(q.level).toBe('kocarek');
      expect(LEVEL_THEMES.kocarek).toContain(q.theme);
      expect(t.fallback).toBe(true);
    }
  });

  it('keeps the round theme when the level has it', () => {
    const g = newGame([family[1]], ['dejiny']);
    for (const t of g.rounds[0].turns) {
      expect(g.questions[t.questionId].theme).toBe('dejiny');
      expect(t.fallback).toBe(false);
    }
  });

  it('shuffles the options of point questions too', () => {
    const g = newGame([family[0]], ['priroda', 'jidlo']);
    const turns = g.rounds.flatMap((r) => r.turns);
    const point = turns.find((t) => g.questions[t.questionId].type === 'point')!;
    const q = g.questions[point.questionId] as Extract<Question, { type: 'point' }>;
    expect(point.options?.slice().sort()).toEqual(q.options.slice().sort());
  });
});

describe('timers per level', () => {
  it('has no timer for kocarek and piskoviste and a longer one for prvnacek', () => {
    expect(levelTimer('kocarek', 30)).toBeNull();
    expect(levelTimer('piskoviste', 30)).toBeNull();
    expect(levelTimer('prvnacek', 30)).toBe(45);
    expect(levelTimer('lavice', 30)).toBe(30);
    expect(levelTimer('hospoda', null)).toBeNull();
    expect(timerFor(newGame(), 'prvnacek')).toBe(45);
  });
});

/** Moves a tablet game to the question of the contestant with the given level. */
function toQuestionOf(state: GameState, level: string): GameState {
  let s = reduce(state, { type: 'startRound' });
  for (let guard = 0; guard < 20; guard++) {
    s = reduce(s, { type: 'ready' });
    if (currentQuestion(s)?.level === level) return s;
    const q = currentQuestion(s)!;
    if (hasOptions(q)) s = reduce(s, { type: 'answer', value: q.answer });
    else if (q.type === 'estimate') s = reduce(s, { type: 'answer', value: q.answer });
    else s = reduce(reduce(s, { type: 'reveal' }), { type: 'judge', correct: true });
    s = reduce(s, { type: 'next' });
  }
  throw new Error(`no question for ${level}`);
}

describe('tablet: point and imitate', () => {
  const kocarekPool = pool.filter((q) => q.level === 'kocarek');
  const only = (type: 'point' | 'imitate') =>
    createGame(
      { seed: 1, themes: ['priroda'], questionsPerContestant: 1, contestants: [family[0]] },
      kocarekPool.filter((q) => q.type === type),
    );

  it('scores a point question like a choice', () => {
    let s = toQuestionOf(only('point'), 'kocarek');
    const q = currentQuestion(s)!;
    expect(q.type).toBe('point');
    expect(reduce(s, { type: 'answer', value: 'nic takového' })).toBe(s);
    s = reduce(s, { type: 'answer', value: q.answer });
    expect(s.phase).toBe('feedback');
    expect(s.answers[0]).toMatchObject({ correct: true, points: 1 });
  });

  it('lets the parent confirm an imitation right from the question', () => {
    let s = toQuestionOf(only('imitate'), 'kocarek');
    expect(currentQuestion(s)!.type).toBe('imitate');
    expect(reduce(s, { type: 'answer', value: 'Mééé' })).toBe(s);
    s = reduce(s, { type: 'judge', correct: true });
    expect(s.phase).toBe('feedback');
    expect(s.answers[0]).toMatchObject({ correct: true, basePoints: 1 });
  });

  it('also goes through reveal → judge like an open question', () => {
    let s = toQuestionOf(only('imitate'), 'kocarek');
    s = reduce(s, { type: 'reveal' });
    expect(s.phase).toBe('judge');
    s = reduce(s, { type: 'judge', correct: false });
    expect(s.answers[0]).toMatchObject({ correct: false, points: 0 });
  });

  it('does not judge a choice question from the question phase', () => {
    const s = toQuestionOf(newGame([family[1]]), 'prvnacek');
    expect(reduce(s, { type: 'judge', correct: true })).toBe(s);
  });
});

describe('live: point and imitate', () => {
  const livePool = makePool({ kocarek: 'imitate', prvnacek: 'choice', hospoda: 'open' }, ['priroda'], 3);
  const contestants = [
    { ...family[0], onTv: true },
    { ...family[1], onTv: false },
    { ...family[2], onTv: false },
  ];
  function live(pool = livePool, cs = contestants): LiveState {
    const s = createLiveGame({ seed: 3, themes: ['priroda'], questionsPerContestant: 1, timerSeconds: 20, contestants: cs }, pool);
    return act(act(s, { type: 'start' }), { type: 'startRound' }, HOST, 1_000);
  }

  it('gives prvnacek a longer deadline than adults and none to kocarek', () => {
    const s = live();
    expect(liveTimerFor(s, 'kocarek')).toBeNull();
    expect(liveTimerFor(s, 'prvnacek')).toBe(30);
    // Phones: prvnacek (30 s) and hospoda (20 s) answer together — the longer timer wins.
    expect(s.deadline).toBe(1_000 + 30_000);
  });

  it('lets the host confirm a TV imitation directly with ✓/✗', () => {
    let s = live();
    const vojtaQ = s.questions[stepTurn(s, 'vojta')!.turn.questionId] as Extract<Question, { type: 'choice' }>;
    s = act(s, { type: 'answer', value: vojtaQ.answer }, as('vojta'));
    s = act(s, { type: 'answer', value: 'Praha' }, as('tata'));
    expect(s.stage).toBe('tv');
    const view = viewFor(s, { role: 'host' });
    expect(view.question).toMatchObject({ type: 'imitate', model: 'Mééé' });
    expect(applyLive(s, { type: 'answer', value: 'něco jiného', by: HOST, now: 2_000 }).ok).toBe(true);
    s = act(s, { type: 'answer', value: IMITATE_DONE });
    expect(s.phase).toBe('reveal');
    const emma = s.answers.find((a) => a.contestantId === 'emma')!;
    expect(emma).toMatchObject({ correct: true, points: 1 });
    // Only the open answer of the adult waits for the host.
    expect(s.unjudged).toEqual(['tata']);
  });

  it('counts ✗ as no point and does not wait for a verdict', () => {
    let s = live(livePool, contestants.map((c) => (c.id === 'emma' ? c : { ...c, onTv: true })).filter((c) => c.id === 'emma'));
    s = act(s, { type: 'answer', value: IMITATE_FAILED });
    expect(s.phase).toBe('reveal');
    expect(s.unjudged).toEqual([]);
    expect(s.answers[0]).toMatchObject({ correct: false, points: 0 });
  });

  it('a "done" from a phone waits for the host, who can judge it', () => {
    const phone = [{ ...family[0], onTv: false }];
    let s = live(livePool, phone);
    s = act(s, { type: 'answer', value: '' }, as('emma'));
    expect(s.phase).toBe('reveal');
    expect(s.unjudged).toEqual(['emma']);
    s = act(s, { type: 'judge', contestantId: 'emma', correct: true });
    expect(s.scores.emma).toBe(1);
    expect(s.unjudged).toEqual([]);
  });

  it('scores a point question like a choice', () => {
    const pointPool = makePool({ kocarek: 'point' }, ['priroda'], 2);
    let s = live(pointPool, [{ ...family[0], onTv: true }]);
    const view = viewFor(s, { role: 'host' });
    expect(view.question?.options?.slice().sort()).toEqual(['🐱 Kočička', '🐶 Pejsek']);
    expect(applyLive(s, { type: 'answer', value: 'Mééé', by: HOST, now: 2_000 }).ok).toBe(false);
    s = act(s, { type: 'answer', value: '🐶 Pejsek' });
    expect(s.answers[0]).toMatchObject({ correct: true, points: 1 });
  });
});

describe('Řekni, ukaž, nakresli: cards by level', () => {
  it('maps a level without own cards to the nearest one', () => {
    expect(cardLevelFor('kocarek', ['hospoda', 'lavice', 'piskoviste'])).toBe('piskoviste');
    expect(cardLevelFor('prvnacek', ['hospoda', 'lavice', 'piskoviste'])).toBe('piskoviste');
    expect(cardLevelFor('prvnacek', ['hospoda', 'lavice'])).toBe('lavice');
    expect(cardLevelFor('prvnacek', ['prvnacek', 'lavice'])).toBe('prvnacek');
    expect(cardLevelFor('kocarek', ['kocarek', 'piskoviste'])).toBe('kocarek');
  });

  it('lets kocarek only act out and draw', () => {
    expect(modesForLevel('kocarek')).toEqual(['ukaz', 'nakresli']);
    expect(modesForLevel('prvnacek')).toEqual(['rekni', 'ukaz', 'nakresli']);
  });

  it('builds kocarek and prvnacek decks from the nearest level and gives kocarek a helper', () => {
    const cards: AktivityCard[] = [];
    for (const level of ['piskoviste', 'lavice', 'hospoda'] as const) {
      for (let i = 1; i <= 9; i++) {
        cards.push({ id: `${level}-${String(i).padStart(3, '0')}`, level, word: `${level} ${i}`, mode: 'any', difficulty: ([3, 4, 5] as const)[i % 3], image: '🐸' });
      }
    }
    const s = createAktivity(
      {
        seed: 1,
        teams: [
          { id: 'a', name: 'A', players: [{ id: 'emma', name: 'Ema', level: 'kocarek' }, { id: 'tata', name: 'Táta', level: 'hospoda' }] },
          { id: 'b', name: 'B', players: [{ id: 'vojta', name: 'Vojta', level: 'prvnacek' }, { id: 'mama', name: 'Máma', level: 'hospoda' }] },
        ],
      },
      cards,
    );
    const levelsIn = (deckLevel: 'kocarek' | 'prvnacek') =>
      new Set(Object.values(s.decks[deckLevel]!).flat().map((id) => s.cards[id].level));
    expect(levelsIn('kocarek')).toEqual(new Set(['piskoviste']));
    expect(levelsIn('prvnacek')).toEqual(new Set(['piskoviste']));
    expect(s.warnings).toEqual([]);
  });
});

describe('Město, jméno, zvíře: levels', () => {
  it('does not offer kocarek as a player', () => {
    expect(MJZ_LEVELS).not.toContain('kocarek');
    expect(MJZ_LEVELS).toContain('prvnacek');
  });

  it('gives prvnacek the children categories, more time and the kids bonus', () => {
    expect(DEFAULT_SETTINGS.levelRules.prvnacek.categoryIds).toEqual(KIDS_CATEGORIES.map((c) => c.id));
    expect(writingSecondsFor(DEFAULT_SETTINGS, 'prvnacek')).toBe(DEFAULT_SETTINGS.timeSeconds + 60);
    expect(applyKidsBonus(10, 'prvnacek', true)).toBe(15);
    expect(applyKidsBonus(10, 'lavice', true)).toBe(15);
    expect(applyKidsBonus(10, 'hospoda', true)).toBe(10);
  });
});

describe('chess hints by level', () => {
  it('gives children unlimited advice', () => {
    for (const level of ['kocarek', 'piskoviste', 'prvnacek'] as const) {
      expect(hintProfile(level)).toMatchObject({ threatWarnings: true, blunderCheck: true, adviceLimit: null });
    }
    expect(hintProfile('hospoda').threatWarnings).toBe(false);
  });
});
