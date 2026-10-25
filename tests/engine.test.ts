import { describe, expect, it } from 'vitest';
import type { Question } from '../src/lib/types.ts';
import {
  createGame,
  currentContestant,
  currentQuestion,
  currentTurn,
  mulberry32,
  reduce,
  scoreEstimate,
  standings,
  summarize,
  type Action,
  type Contestant,
  type GameState,
} from '../src/lib/engine/index.ts';

const fixtures = import.meta.glob<Question[]>('./fixtures/questions/**/*.json', { eager: true, import: 'default' });
const pool = Object.values(fixtures)
  .flat()
  .filter((q) => q.status === 'verified');

const players: Contestant[] = [
  { id: 'tata', name: 'Táta', avatar: '🐻', level: 'hospoda', memberIds: ['tata'] },
  { id: 'anicka', name: 'Anička', avatar: '🦊', level: 'lavice', memberIds: ['anicka'] },
  { id: 'kuba', name: 'Kuba', avatar: '🐸', level: 'piskoviste', memberIds: ['kuba'] },
];

function newGame(overrides: Partial<Parameters<typeof createGame>[0]> = {}, seen = {}): GameState {
  return createGame(
    { seed: 42, themes: ['priroda', 'dejiny'], questionsPerContestant: 2, contestants: players, ...overrides },
    pool,
    seen,
  );
}

function q(state: GameState): Question {
  return currentQuestion(state)!;
}

/** Answers the current question correctly (or wrongly) whatever its type. */
function answer(state: GameState, correct = true): GameState {
  const question = q(state);
  if (question.type === 'choice') {
    const value = correct ? question.answer : question.options.find((o) => o !== question.answer)!;
    return reduce(state, { type: 'answer', value });
  }
  if (question.type === 'estimate') {
    return reduce(state, { type: 'answer', value: correct ? question.answer : question.answer * 10 });
  }
  return reduce(reduce(state, { type: 'reveal' }), { type: 'judge', correct });
}

/** Plays the whole game, answering via `decide`. */
function playAll(state: GameState, decide: (s: GameState) => boolean = () => true): GameState {
  let s = state;
  for (let guard = 0; guard < 500 && s.phase !== 'finished'; guard++) {
    if (s.phase === 'roundIntro') s = reduce(s, { type: 'startRound' });
    else if (s.phase === 'handover') s = reduce(s, { type: 'ready' });
    else if (s.phase === 'question') s = answer(s, decide(s));
    else s = reduce(s, { type: 'next' });
  }
  return s;
}

describe('rng', () => {
  it('mulberry32 is deterministic for a seed', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('createGame', () => {
  it('rotates contestants within a round and the starter between rounds', () => {
    const s = newGame();
    expect(s.rounds[0].turns.map((t) => t.contestantId)).toEqual(['tata', 'anicka', 'kuba', 'tata', 'anicka', 'kuba']);
    expect(s.rounds[1].turns.map((t) => t.contestantId)).toEqual(['anicka', 'kuba', 'tata', 'anicka', 'kuba', 'tata']);
  });

  it('gives each contestant a question of their own level from the round theme', () => {
    const s = newGame();
    for (const turn of s.rounds[0].turns) {
      const question = s.questions[turn.questionId];
      const c = players.find((p) => p.id === turn.contestantId)!;
      expect(question.level).toBe(c.level);
      expect(question.theme).toBe('priroda');
      expect(turn.fallback).toBe(false);
    }
  });

  it('falls back to preschool themes when the round theme has no preschool questions', () => {
    const s = newGame();
    const kubaTurns = s.rounds[1].turns.filter((t) => t.contestantId === 'kuba');
    expect(kubaTurns).toHaveLength(2);
    for (const turn of kubaTurns) {
      const question = s.questions[turn.questionId];
      expect(question.level).toBe('piskoviste');
      expect(question.theme).not.toBe('dejiny');
      expect(turn.fallback).toBe(true);
    }
  });

  it('never uses draft questions passed through filtering and never repeats within a game', () => {
    const s = newGame();
    const ids = s.rounds.flatMap((r) => r.turns.map((t) => t.questionId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('hospoda-priroda-006');
  });

  it('is deterministic for the same seed and differs for another seed', () => {
    const a = newGame();
    const b = newGame();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const others = [1, 2, 3, 4, 5].map((seed) => JSON.stringify(newGame({ seed }).rounds));
    expect(others.some((o) => o !== JSON.stringify(a.rounds))).toBe(true);
  });

  it('does not depend on the order of the question pool', () => {
    const a = createGame({ seed: 9, themes: ['priroda'], questionsPerContestant: 2, contestants: players }, pool);
    const b = createGame(
      { seed: 9, themes: ['priroda'], questionsPerContestant: 2, contestants: players },
      pool.slice().reverse(),
    );
    expect(b.rounds).toEqual(a.rounds);
  });

  it('avoids questions the contestant has already seen', () => {
    const seen = { tata: ['hospoda-priroda-001', 'hospoda-priroda-002', 'hospoda-priroda-003'] };
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame({ seed, themes: ['priroda'], questionsPerContestant: 2, contestants: players }, pool, seen);
      const tata = s.rounds[0].turns.filter((t) => t.contestantId === 'tata').map((t) => t.questionId);
      expect(tata.sort()).toEqual(['hospoda-priroda-004', 'hospoda-priroda-005']);
    }
  });

  it('shuffles choice options but keeps the same set', () => {
    const s = newGame();
    for (const turn of s.rounds.flatMap((r) => r.turns)) {
      const question = s.questions[turn.questionId];
      if (question.type === 'choice') expect(turn.options!.slice().sort()).toEqual(question.options.slice().sort());
    }
  });

  it('keeps the state JSON-serializable', () => {
    const s = playAll(newGame());
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('reduce', () => {
  it('walks roundIntro → handover → question → feedback → handover', () => {
    let s = newGame();
    expect(s.phase).toBe('roundIntro');
    s = reduce(s, { type: 'startRound' });
    expect(s.phase).toBe('handover');
    expect(currentContestant(s)!.id).toBe('tata');
    s = reduce(s, { type: 'ready' });
    expect(s.phase).toBe('question');
    s = answer(s);
    expect(s.phase).toBe('feedback');
    s = reduce(s, { type: 'next' });
    expect(s.phase).toBe('handover');
    expect(currentContestant(s)!.id).toBe('anicka');
  });

  it('ignores actions that do not fit the phase', () => {
    const s = newGame();
    const actions: Action[] = [{ type: 'ready' }, { type: 'answer', value: 'x' }, { type: 'next' }, { type: 'judge', correct: true }];
    for (const a of actions) expect(reduce(s, a)).toBe(s);
  });

  it('rejects a choice answer that is not among the options', () => {
    let s = reduce(reduce(newGame(), { type: 'startRound' }), { type: 'ready' });
    expect(reduce(s, { type: 'answer', value: 'Nesmysl' })).toBe(s);
  });

  it('scores choice 1 point and open questions by the table judgement', () => {
    const s = playAll(newGame({ themes: ['priroda'], questionsPerContestant: 1 }));
    expect(s.scores).toEqual({ tata: expect.any(Number), anicka: 1, kuba: 1 });
    const open = createGame(
      { seed: 1, themes: ['dejiny'], questionsPerContestant: 3, contestants: [players[0]] },
      pool,
    );
    let o = reduce(open, { type: 'startRound' });
    while (o.phase !== 'roundEnd') {
      if (o.phase === 'handover') o = reduce(o, { type: 'ready' });
      else if (o.phase === 'question' && q(o).type === 'open') {
        o = reduce(o, { type: 'reveal' });
        expect(o.phase).toBe('judge');
        o = reduce(o, { type: 'judge', correct: true });
        expect(o.answers.at(-1)!.points).toBe(1);
      } else if (o.phase === 'question') o = answer(o, false);
      else o = reduce(o, { type: 'next' });
    }
    expect(o.scores.tata).toBe(1);
  });

  it('records a timeout as zero points', () => {
    let s = reduce(reduce(newGame(), { type: 'startRound' }), { type: 'ready' });
    s = reduce(s, { type: 'timeout' });
    expect(s.answers[0]).toMatchObject({ timedOut: true, points: 0, correct: false });
  });

  it('ends the game after the last round', () => {
    const s = playAll(newGame());
    expect(s.phase).toBe('finished');
    expect(s.answers).toHaveLength(12);
    expect(reduce(s, { type: 'next' })).toBe(s);
  });
});

describe('estimate scoring', () => {
  it('gives 2 points within 10 %, 1 point within 25 %, otherwise 0', () => {
    expect(scoreEstimate(100, 100).points).toBe(2);
    expect(scoreEstimate(110, 100).points).toBe(2);
    expect(scoreEstimate(90, 100).points).toBe(2);
    expect(scoreEstimate(111, 100).points).toBe(1);
    expect(scoreEstimate(75, 100).points).toBe(1);
    expect(scoreEstimate(74, 100).points).toBe(0);
    expect(scoreEstimate(300, 100).points).toBe(0);
    expect(scoreEstimate(105, 100).error).toBeCloseTo(0.05);
  });

  it('applies estimate points inside the reducer', () => {
    const solo = [players[0]];
    let s = createGame({ seed: 3, themes: ['dejiny'], questionsPerContestant: 3, contestants: solo }, pool);
    s = reduce(s, { type: 'startRound' });
    while (s.phase !== 'roundEnd') {
      if (s.phase === 'handover') s = reduce(s, { type: 'ready' });
      else if (s.phase === 'question' && q(s).type === 'estimate') {
        s = reduce(s, { type: 'answer', value: 120 }); // answer 100 → 20 % off
        expect(s.answers.at(-1)).toMatchObject({ basePoints: 1, correct: true });
      } else if (s.phase === 'question') s = answer(s, false);
      else s = reduce(s, { type: 'next' });
    }
    expect(s.scores.tata).toBe(1);
  });
});

describe('joker', () => {
  it('doubles points in the chosen round only', () => {
    let s = newGame();
    s = reduce(s, { type: 'toggleJoker', contestantId: 'anicka' });
    expect(s.jokers.anicka).toBe(0);
    s = playAll(s);
    const r0 = s.answers.filter((a) => a.contestantId === 'anicka' && a.round === 0);
    const r1 = s.answers.filter((a) => a.contestantId === 'anicka' && a.round === 1);
    expect(r0.every((a) => a.points === 2)).toBe(true);
    expect(r1.every((a) => a.points === 1)).toBe(true);
    expect(s.scores.anicka).toBe(6);
  });

  it('can be toggled off before the round but not used twice', () => {
    let s = newGame();
    s = reduce(s, { type: 'toggleJoker', contestantId: 'kuba' });
    s = reduce(s, { type: 'toggleJoker', contestantId: 'kuba' });
    expect(s.jokers.kuba).toBeNull();
    s = reduce(s, { type: 'toggleJoker', contestantId: 'kuba' });
    // finish round 0
    while (s.phase !== 'roundIntro' || s.roundIndex === 0) {
      if (s.phase === 'roundIntro') s = reduce(s, { type: 'startRound' });
      else if (s.phase === 'handover') s = reduce(s, { type: 'ready' });
      else if (s.phase === 'question') s = answer(s);
      else s = reduce(s, { type: 'next' });
    }
    expect(s.roundIndex).toBe(1);
    const again = reduce(s, { type: 'toggleJoker', contestantId: 'kuba' });
    expect(again).toBe(s);
    expect(again.jokers.kuba).toBe(0);
  });

  it('cannot be toggled once the round started', () => {
    let s = reduce(newGame(), { type: 'startRound' });
    expect(reduce(s, { type: 'toggleJoker', contestantId: 'tata' })).toBe(s);
  });
});

describe('summary', () => {
  it('ranks contestants with shared places for ties', () => {
    // Everyone answers everything correctly → 4 + 4 + 4 for lavice/piskoviste; tata has estimates worth 2.
    const s = playAll(newGame({ themes: ['priroda'], questionsPerContestant: 1 }), (st) => currentTurn(st)!.contestantId !== 'tata');
    const ranking = standings(s);
    expect(ranking.map((r) => [r.contestant.id, r.place])).toEqual([
      ['anicka', 1],
      ['kuba', 1],
      ['tata', 3],
    ]);
  });

  it('reports theme success, best answer and seen questions', () => {
    const s = playAll(newGame());
    const summary = summarize(s);
    expect(summary.ranking[0].contestant.id).toBe('tata');
    expect(summary.themeStats.anicka).toEqual({ priroda: { correct: 2, total: 2 }, dejiny: { correct: 2, total: 2 } });
    const kubaThemes = Object.keys(summary.themeStats.kuba);
    expect(kubaThemes).not.toContain('dejiny');
    expect(summary.seenByContestant.tata).toHaveLength(4);
    expect(summary.best).not.toBeNull();
  });

  it('prefers the most accurate estimate as the best answer', () => {
    const solo = [players[0]];
    let s = createGame({ seed: 5, themes: ['dejiny'], questionsPerContestant: 3, contestants: solo }, pool);
    s = playAll(s);
    const best = summarize(s).best!;
    expect(best.kind).toBe('estimate');
    expect(best.questionId).toBe('hospoda-dejiny-002');
    expect(best.error).toBe(0);
  });

  it('falls back to the hardest correct question', () => {
    const s = playAll(createGame({ seed: 5, themes: ['priroda'], questionsPerContestant: 2, contestants: [players[1]] }, pool));
    const best = summarize(s).best!;
    expect(best.kind).toBe('hardest');
    expect(s.questions[best.questionId].level).toBe('lavice');
  });
});
