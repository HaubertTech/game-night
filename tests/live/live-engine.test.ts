import { describe, expect, it } from 'vitest';
import { createGame, summarize } from '../../src/lib/engine/quiz.ts';
import {
  applyLive,
  createLiveGame,
  currentTvContestant,
  reduceLive,
  stepCount,
  stepTurn,
  summarizeLive,
  toGameState,
  type LiveAction,
  type LiveState,
} from '../../src/lib/engine/live.ts';
import { viewFor } from '../../src/lib/live/protocol.ts';
import { act, as, HOST, makePool, players, SYSTEM, valueFor } from './helpers.ts';

const choicePool = makePool({ hospoda: 'choice', lavice: 'choice', piskoviste: 'choice' });

function game(overrides: Partial<Parameters<typeof createLiveGame>[0]> = {}, pool = choicePool): LiveState {
  return createLiveGame(
    { seed: 7, themes: ['priroda', 'dejiny'], questionsPerContestant: 2, timerSeconds: 20, contestants: players, ...overrides },
    pool,
  );
}

/** Lobby → first step asking. */
function asking(state = game(), now = 1_000): LiveState {
  return act(act(state, { type: 'start' }), { type: 'startRound' }, HOST, now);
}

describe('live engine: creation', () => {
  it('draws the same questions as the tablet game for the same seed', () => {
    const live = game();
    const pass = createGame(
      { seed: 7, themes: ['priroda', 'dejiny'], questionsPerContestant: 2, timerSeconds: 20, contestants: players },
      choicePool,
    );
    expect(live.rounds).toEqual(pass.rounds);
    expect(Object.keys(live.questions).sort()).toEqual(Object.keys(pass.questions).sort());
  });

  it('starts in the lobby and survives a JSON round trip', () => {
    const s = game();
    expect(s.phase).toBe('lobby');
    expect(s.mode).toBe('live');
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('keeps the onTv flag per contestant', () => {
    expect(game().config.contestants.map((c) => c.onTv)).toEqual([false, false, true]);
  });
});

describe('live engine: simultaneous answers', () => {
  it('collects phone answers in any order and waits for everyone', () => {
    let s = asking();
    expect(s.phase).toBe('asking');
    expect(s.stage).toBe('phones');
    s = act(s, { type: 'answer', value: valueFor(s, 'anicka') }, as('anicka'));
    expect(s.stage).toBe('phones');
    expect(s.scores.anicka).toBe(0); // nothing scored before reveal
    s = act(s, { type: 'answer', value: valueFor(s, 'tata', false) }, as('tata'));
    expect(s.stage).toBe('tv');
    expect(currentTvContestant(s)?.id).toBe('kuba');
  });

  it('then lets the host answer for the TV contestant and reveals everyone', () => {
    let s = asking();
    s = act(s, { type: 'answer', value: valueFor(s, 'tata') }, as('tata'));
    s = act(s, { type: 'answer', value: valueFor(s, 'anicka', false) }, as('anicka'));
    s = act(s, { type: 'answer', value: valueFor(s, 'kuba') }, HOST);
    expect(s.phase).toBe('reveal');
    expect(s.scores).toEqual({ tata: 1, anicka: 0, kuba: 1 });
    expect(s.answers.map((a) => [a.contestantId, a.correct])).toEqual([
      ['tata', true],
      ['anicka', false],
      ['kuba', true],
    ]);
  });

  it('refuses a second answer from the same contestant', () => {
    let s = asking();
    s = act(s, { type: 'answer', value: valueFor(s, 'tata') }, as('tata'));
    const r = applyLive(s, { type: 'answer', value: valueFor(s, 'tata'), by: as('tata'), now: 2_000 });
    expect(r).toMatchObject({ ok: false, error: 'alreadyAnswered' });
  });

  it('refuses an option that is not offered', () => {
    const r = applyLive(asking(), { type: 'answer', value: 'Kdovíco', by: as('tata'), now: 2_000 });
    expect(r).toMatchObject({ ok: false, error: 'invalidAnswer' });
  });

  it('walks through all steps and rounds to finished', () => {
    let s = asking();
    let guard = 0;
    while (s.phase !== 'finished' && guard++ < 100) {
      if (s.phase === 'asking' && s.stage === 'phones') {
        for (const id of ['tata', 'anicka']) if (!s.pending[id]) s = act(s, { type: 'answer', value: valueFor(s, id) }, as(id));
      } else if (s.phase === 'asking') s = act(s, { type: 'answer', value: valueFor(s, currentTvContestant(s)!.id) });
      else if (s.phase === 'roundIntro') s = act(s, { type: 'startRound' });
      else s = act(s, { type: 'next' });
    }
    expect(s.phase).toBe('finished');
    expect(s.answers).toHaveLength(2 * 2 * 3);
    expect(s.scores).toEqual({ tata: 4, anicka: 4, kuba: 4 });
  });
});

describe('live engine: permissions', () => {
  it('a contestant cannot answer for someone else', () => {
    const r = applyLive(asking(), { type: 'answer', value: 'Ano', contestantId: 'anicka', by: as('tata'), now: 1 });
    expect(r).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('only the host starts, judges and moves on', () => {
    const lobby = game();
    expect(applyLive(lobby, { type: 'start', by: as('tata'), now: 1 })).toMatchObject({ ok: false, error: 'forbidden' });
    const intro = act(lobby, { type: 'start' });
    expect(applyLive(intro, { type: 'startRound', by: as('tata'), now: 1 })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(applyLive(intro, { type: 'next', by: as('tata'), now: 1 })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(applyLive(intro, { type: 'kick', contestantId: 'anicka', by: as('tata'), now: 1 })).toMatchObject({ ok: false });
  });

  it('the host answers only in the TV stage, not for phones', () => {
    const r = applyLive(asking(), { type: 'answer', value: 'Ano', contestantId: 'tata', by: HOST, now: 1 });
    expect(r).toMatchObject({ ok: false, error: 'wrongPhase' });
  });

  it('a TV contestant cannot answer from a phone', () => {
    let s = asking();
    s = act(s, { type: 'answer', value: valueFor(s, 'tata') }, as('tata'));
    s = act(s, { type: 'answer', value: valueFor(s, 'anicka') }, as('anicka'));
    expect(applyLive(s, { type: 'answer', value: 'Ano', by: as('kuba'), now: 1 })).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('only the system may send timeout and clients may not pose as system for other actions', () => {
    const s = asking();
    expect(applyLive(s, { type: 'timeout', by: HOST, now: 999_999 })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(applyLive(s, { type: 'next', by: SYSTEM, now: 1 })).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('a contestant toggles only their own joker', () => {
    const intro = act(game(), { type: 'start' });
    expect(applyLive(intro, { type: 'toggleJoker', contestantId: 'anicka', by: as('tata'), now: 1 })).toMatchObject({
      ok: false,
      error: 'forbidden',
    });
    expect(act(intro, { type: 'toggleJoker', contestantId: 'tata' }, as('tata')).jokers.tata).toBe(0);
  });

  it('reduceLive leaves the state untouched on refusal', () => {
    const s = asking();
    const action: LiveAction = { type: 'next', by: as('tata'), now: 1 };
    expect(reduceLive(s, action)).toBe(s);
  });
});

describe('live engine: deadline and timeout', () => {
  it('sets the deadline from now and the timer', () => {
    expect(asking(game(), 50_000).deadline).toBe(50_000 + 20_000);
  });

  it('refuses an early timeout and times out late phones', () => {
    let s = asking(game(), 0);
    s = act(s, { type: 'answer', value: valueFor(s, 'tata') }, as('tata'), 5_000);
    expect(applyLive(s, { type: 'timeout', by: SYSTEM, now: 19_999 })).toMatchObject({ ok: false, error: 'notYet' });
    s = act(s, { type: 'timeout' }, SYSTEM, 20_000);
    expect(s.pending.anicka).toMatchObject({ given: null, timedOut: true });
    expect(s.stage).toBe('tv');
    // Preschool on TV has no timer.
    expect(s.deadline).toBeNull();
  });

  it('records the timeout as 0 points with timedOut', () => {
    let s = asking(game({ contestants: players.slice(0, 2) }), 0);
    s = act(s, { type: 'timeout' }, SYSTEM, 20_000);
    expect(s.phase).toBe('reveal');
    expect(s.answers.every((a) => a.timedOut && a.points === 0)).toBe(true);
  });

  it('does not time out a preschooler on a phone; the host closes the answers', () => {
    const contestants = players.map((c) => ({ ...c, onTv: false }));
    let s = asking(game({ contestants }), 0);
    s = act(s, { type: 'timeout' }, SYSTEM, 20_000);
    expect(s.phase).toBe('asking');
    expect(s.pending.kuba).toBeUndefined();
    expect(s.deadline).toBeNull();
    s = act(s, { type: 'closeAnswers' });
    expect(s.phase).toBe('reveal');
  });

  it('has no deadline without a timer', () => {
    expect(asking(game({ timerSeconds: null })).deadline).toBeNull();
  });
});

describe('live engine: TV contestants', () => {
  it('can be switched in the lobby and goes first when alone', () => {
    let s = act(game(), { type: 'setOnTv', contestantId: 'tata', onTv: true });
    s = act(act(s, { type: 'setOnTv', contestantId: 'anicka', onTv: true }), { type: 'start' });
    s = act(s, { type: 'startRound' });
    expect(s.stage).toBe('tv');
    expect(currentTvContestant(s)?.id).toBe('tata');
    s = act(s, { type: 'answer', value: valueFor(s, 'tata') });
    expect(currentTvContestant(s)?.id).toBe('anicka');
    expect(s.deadline).toBe(1_000 + 20_000);
  });

  it('cannot be switched during a round', () => {
    const r = applyLive(asking(), { type: 'setOnTv', contestantId: 'tata', onTv: true, by: HOST, now: 1 });
    expect(r).toMatchObject({ ok: false, error: 'wrongPhase' });
  });
});

describe('live engine: joker', () => {
  it('doubles the points of the round', () => {
    let s = act(game(), { type: 'start' });
    s = act(s, { type: 'toggleJoker', contestantId: 'tata' }, as('tata'));
    s = act(s, { type: 'startRound' });
    s = act(s, { type: 'answer', value: valueFor(s, 'tata') }, as('tata'));
    s = act(s, { type: 'answer', value: valueFor(s, 'anicka') }, as('anicka'));
    s = act(s, { type: 'answer', value: valueFor(s, 'kuba') });
    expect(s.scores.tata).toBe(2);
    expect(s.scores.anicka).toBe(1);
  });
});

describe('live engine: open questions and estimates', () => {
  const pool = makePool({ hospoda: 'open', lavice: 'estimate', piskoviste: 'choice' });

  function revealed(): LiveState {
    let s = asking(game({}, pool));
    s = act(s, { type: 'answer', value: '  Praha ' }, as('tata'));
    s = act(s, { type: 'answer', value: 105 }, as('anicka'));
    return act(s, { type: 'answer', value: valueFor(s, 'kuba') });
  }

  it('scores estimates at reveal and waits for the host on open answers', () => {
    const s = revealed();
    expect(s.phase).toBe('reveal');
    expect(s.unjudged).toEqual(['tata']);
    expect(s.scores.anicka).toBe(1);
    expect(s.answers.find((a) => a.contestantId === 'tata')?.given).toBe('Praha');
    expect(applyLive(s, { type: 'next', by: HOST, now: 1 })).toMatchObject({ ok: false, error: 'unjudged' });
  });

  it('applies and corrects the verdict', () => {
    let s = act(revealed(), { type: 'judge', contestantId: 'tata', correct: true });
    expect(s.scores.tata).toBe(1);
    expect(s.unjudged).toEqual([]);
    s = act(s, { type: 'judge', contestantId: 'tata', correct: false });
    expect(s.scores.tata).toBe(0);
    expect(act(s, { type: 'next' }).phase).toBe('asking');
  });

  it('refuses a verdict on a non-open question', () => {
    expect(applyLive(revealed(), { type: 'judge', contestantId: 'anicka', correct: true, by: HOST, now: 1 })).toMatchObject({
      ok: false,
      error: 'forbidden',
    });
  });

  it('refuses an estimate sent as text', () => {
    const r = applyLive(asking(game({}, pool)), { type: 'answer', value: '105', by: as('anicka'), now: 1 });
    expect(r).toMatchObject({ ok: false, error: 'invalidAnswer' });
  });
});

describe('live engine: kick', () => {
  it('stops waiting for a kicked phone', () => {
    let s = asking();
    s = act(s, { type: 'answer', value: valueFor(s, 'tata') }, as('tata'));
    s = act(s, { type: 'kick', contestantId: 'anicka' });
    expect(s.stage).toBe('tv');
    expect(applyLive(s, { type: 'toggleJoker', contestantId: 'anicka', by: as('anicka'), now: 1 }).ok).toBe(false);
    s = act(s, { type: 'answer', value: valueFor(s, 'kuba') });
    expect(s.answers.map((a) => a.contestantId)).toEqual(['tata', 'kuba']);
  });
});

describe('live view', () => {
  it('shows a phone only its own question, without the answer', () => {
    const s = asking();
    const view = viewFor(s, { role: 'contestant', contestantId: 'tata' });
    const own = s.questions[stepTurn(s, 'tata')!.turn.questionId];
    expect(view.question?.id).toBe(own.id);
    expect(view.question?.options).toEqual(stepTurn(s, 'tata')!.turn.options);
    const json = JSON.stringify(view);
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain('"fact"');
    expect(json).not.toContain(s.questions[stepTurn(s, 'anicka')!.turn.questionId].text);
  });

  it('shows the TV no phone questions while asking, then the TV contestant question without its answer', () => {
    let s = asking();
    expect(viewFor(s, { role: 'host' }).question).toBeNull();
    s = act(s, { type: 'answer', value: valueFor(s, 'tata') }, as('tata'));
    const after = viewFor(s, { role: 'host' });
    expect(after.contestants.find((c) => c.id === 'tata')?.answered).toBe(true);
    expect(JSON.stringify(after)).not.toContain('"Ano"'); // tata's given choice stays hidden
    s = act(s, { type: 'answer', value: valueFor(s, 'anicka') }, as('anicka'));
    const tv = viewFor(s, { role: 'host' });
    expect(tv.questionFor).toBe('kuba');
    expect(JSON.stringify(tv)).not.toContain('"answer"');
  });

  it('reveals answers, facts and verdicts to everyone after the step', () => {
    let s = asking();
    s = act(s, { type: 'answer', value: valueFor(s, 'tata') }, as('tata'));
    s = act(s, { type: 'answer', value: valueFor(s, 'anicka') }, as('anicka'));
    s = act(s, { type: 'answer', value: valueFor(s, 'kuba') });
    const view = viewFor(s, { role: 'contestant', contestantId: 'anicka' });
    expect(view.reveal).toHaveLength(3);
    expect(view.reveal?.[0].question.type === 'choice' && view.reveal[0].question.answer).toBe('Ano');
    expect(view.question).toBeNull();
  });

  it('hides warnings from phones', () => {
    const s = { ...game(), warnings: ['došly otázky'] };
    expect(viewFor(s, { role: 'host' }).warnings).toEqual(['došly otázky']);
    expect(viewFor(s, { role: 'contestant', contestantId: 'tata' }).warnings).toEqual([]);
  });
});

describe('live engine: determinism and summary', () => {
  function play(): LiveState {
    let s = asking(game(), 10);
    s = act(s, { type: 'answer', value: valueFor(s, 'anicka') }, as('anicka'), 20);
    s = act(s, { type: 'answer', value: valueFor(s, 'tata', false) }, as('tata'), 30);
    s = act(s, { type: 'answer', value: valueFor(s, 'kuba') }, HOST, 40);
    return act(s, { type: 'next' }, HOST, 50);
  }

  it('gives identical states for identical actions', () => {
    expect(play()).toEqual(play());
    expect(JSON.parse(JSON.stringify(play()))).toEqual(play());
  });

  it('summarizes in the same shape as the tablet game', () => {
    const s = play();
    const live = summarizeLive(s);
    expect(live).toEqual(summarize(toGameState(s)));
    expect(Object.keys(live).sort()).toEqual(['best', 'ranking', 'seenByContestant', 'themeStats']);
    expect(live.seenByContestant.anicka).toHaveLength(1);
  });

  it('counts steps per round', () => {
    expect(stepCount(game())).toBe(2);
  });
});
