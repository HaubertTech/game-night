import { describe, expect, it } from 'vitest';
import {
  aktivityStandings,
  aktivityToMatchResult,
  applyAktivity,
  createAktivity,
  GUESS_GRACE_MS,
  reduceAktivity,
  viewFor,
  type Actor,
  type AktivityCommand,
  type AktivityState,
  type AktivityTeam,
  type CreateAktivityInput,
} from '../../../src/lib/games/aktivity/engine.ts';
import type { AktivityCard, Difficulty } from '../../../src/lib/games/aktivity/types.ts';
import type { Level } from '../../../src/lib/types.ts';

const T0 = Date.parse('2026-10-25T18:00:00Z');
const HOST: Actor = { role: 'host' };
const SYSTEM: Actor = { role: 'system' };
const as = (id: string): Actor => ({ role: 'contestant', contestantId: id });

function cards(level: Level, n: number): AktivityCard[] {
  const out: AktivityCard[] = [];
  for (let i = 1; i <= n; i++) {
    const difficulty = ([3, 4, 5] as const)[i % 3];
    out.push({
      id: `${level}-${String(i).padStart(3, '0')}`,
      level,
      word: `${level} slovo ${i}`,
      mode: level === 'piskoviste' ? (i % 2 ? 'ukaz' : 'any') : (['rekni', 'ukaz', 'nakresli', 'any'] as const)[i % 4],
      difficulty,
      ...(level === 'piskoviste' ? { image: '🐸' } : {}),
      ...(level === 'hospoda' ? { forbidden: ['zakázané'] } : {}),
    });
  }
  return out;
}

const pool: AktivityCard[] = [
  ...cards('hospoda', 30),
  ...cards('lavice', 30),
  ...cards('piskoviste', 30),
  // A preschool card that must never be drawn: preschoolers cannot describe.
  { id: 'piskoviste-099', level: 'piskoviste', word: 'popis', mode: 'rekni', difficulty: 3, image: '🗣️' },
];

const teams: AktivityTeam[] = [
  {
    id: 'modri',
    name: 'Modří',
    players: [
      { id: 'tata', name: 'Táta', level: 'hospoda' },
      { id: 'kuba', name: 'Kuba', level: 'piskoviste' },
    ],
  },
  {
    id: 'cerveni',
    name: 'Červení',
    players: [
      { id: 'mama', name: 'Máma', level: 'hospoda' },
      { id: 'anicka', name: 'Anička', level: 'lavice' },
      { id: 'babi', name: 'Babi', level: 'hospoda' },
    ],
  },
];

function newGame(over: Partial<CreateAktivityInput> = {}, seen: string[] = []): AktivityState {
  return createAktivity({ id: 'g1', createdAt: '2026-10-25T18:00:00Z', seed: 42, teams, ...over }, pool, seen);
}

function act(state: AktivityState, cmd: AktivityCommand, by: Actor = HOST, now = T0): AktivityState {
  const r = applyAktivity(state, { ...cmd, by, now });
  if (!r.ok) throw new Error(`refused ${cmd.type}: ${r.error}`);
  return r.state;
}

/** Plays one turn: pick difficulty, start, finish with `end`. */
function playTurn(
  state: AktivityState,
  end: 'guessed' | 'skip' | 'timeout',
  difficulty: Difficulty = 4,
  now = T0,
): AktivityState {
  let s = act(state, { type: 'startTurn', difficulty }, HOST, now);
  if (end === 'timeout') s = act(s, { type: 'timeout' }, SYSTEM, s.deadline!);
  else s = act(s, { type: end }, HOST, now + 5000);
  return act(s, { type: 'next' }, HOST, now + 6000);
}

describe('createAktivity', () => {
  it('starts in setup with zero scores', () => {
    const s = newGame();
    expect(s.phase).toBe('setup');
    expect(s.scores).toEqual({ modri: 0, cerveni: 0 });
    expect(s.config.timerSeconds).toBe(60);
  });

  it('rejects a team of one and more than four teams', () => {
    const solo: AktivityTeam = { id: 'x', name: 'X', players: [{ id: 'p', name: 'P', level: 'hospoda' }] };
    expect(() => newGame({ teams: [teams[0], solo] })).toThrow(/aspoň dva/);
    const many = [1, 2, 3, 4, 5].map((i) => ({
      id: `t${i}`,
      name: `T${i}`,
      players: [
        { id: `a${i}`, name: 'A', level: 'hospoda' as const },
        { id: `b${i}`, name: 'B', level: 'hospoda' as const },
      ],
    }));
    expect(() => newGame({ teams: many })).toThrow();
  });

  it('never puts a „řekni“ card into a preschool deck', () => {
    const s = newGame();
    const ids = Object.values(s.decks.piskoviste!).flat();
    expect(ids).not.toContain('piskoviste-099');
    expect(ids.every((id) => s.cards[id].mode !== 'rekni')).toBe(true);
  });

  it('puts already seen cards at the end of the deck', () => {
    const fresh = newGame();
    const first = fresh.decks.hospoda![4][0];
    const s = newGame({}, [first]);
    expect(s.decks.hospoda![4][0]).not.toBe(first);
    expect(s.decks.hospoda![4].at(-1)).toBe(first);
  });
});

describe('rotation', () => {
  it('alternates teams and rotates players inside a team', () => {
    let s = act(newGame({ goal: { kind: 'rounds', rounds: 10 } }), { type: 'start' });
    const explainers: string[] = [];
    for (let i = 0; i < 6; i++) {
      explainers.push(s.current!.explainerId);
      s = playTurn(s, 'skip', 4, T0 + i * 100_000);
    }
    expect(explainers).toEqual(['tata', 'mama', 'kuba', 'anicka', 'tata', 'babi']);
    expect(s.history.map((h) => h.round)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('gives a preschooler an adult helper and only ukaz/nakresli', () => {
    let s = act(newGame({ goal: { kind: 'rounds', rounds: 10 } }), { type: 'start' });
    s = playTurn(s, 'skip');
    s = playTurn(s, 'skip');
    expect(s.current!.explainerId).toBe('kuba');
    expect(s.current!.helperId).toBe('tata');
    for (let i = 0; i < 16; i++) {
      const kuba = s.current!.explainerId === 'kuba';
      s = act(s, { type: 'startTurn', difficulty: 3 }, kuba ? as('tata') : HOST);
      if (kuba) {
        expect(['ukaz', 'nakresli']).toContain(s.current!.mode);
        expect(s.cards[s.current!.cardId!].level).toBe('piskoviste');
      }
      s = act(act(s, { type: 'skip' }, kuba ? as('kuba') : HOST), { type: 'next' });
    }
  });
});

describe('turn flow and permissions', () => {
  const started = () => act(newGame(), { type: 'start' });

  it('only the explainer or the host picks the difficulty and starts', () => {
    const s = started();
    expect(applyAktivity(s, { type: 'chooseDifficulty', difficulty: 5, by: as('mama'), now: T0 }).ok).toBe(false);
    expect(applyAktivity(s, { type: 'chooseDifficulty', difficulty: 5, by: as('kuba'), now: T0 })).toMatchObject({
      ok: false,
      error: 'forbidden',
    });
    const chosen = act(s, { type: 'chooseDifficulty', difficulty: 5 }, as('tata'));
    expect(chosen.current!.difficulty).toBe(5);
    const playing = act(chosen, { type: 'startTurn' }, as('tata'), T0);
    expect(playing.phase).toBe('playing');
    expect(playing.deadline).toBe(T0 + 60_000);
    expect(playing.cards[playing.current!.cardId!].difficulty).toBe(5);
  });

  it('refuses to start without a difficulty and rejects invalid ones', () => {
    const s = started();
    expect(applyAktivity(s, { type: 'startTurn', by: HOST, now: T0 })).toMatchObject({ ok: false, error: 'noDifficulty' });
    expect(
      applyAktivity(s, { type: 'chooseDifficulty', difficulty: 7 as Difficulty, by: HOST, now: T0 }),
    ).toMatchObject({ ok: false, error: 'invalidDifficulty' });
  });

  it('scores the card difficulty for a guessed word', () => {
    let s = act(started(), { type: 'startTurn', difficulty: 5 });
    s = act(s, { type: 'guessed' }, as('tata'), T0 + 20_000);
    expect(s.phase).toBe('result');
    expect(s.scores.modri).toBe(5);
    expect(s.history[0]).toMatchObject({ outcome: 'guessed', points: 5, scoringTeamId: 'modri', endedAt: T0 + 20_000 });
  });

  it('skip gives no points', () => {
    let s = act(started(), { type: 'startTurn', difficulty: 3 });
    s = act(s, { type: 'skip' });
    expect(s.scores).toEqual({ modri: 0, cerveni: 0 });
    expect(s.history[0].outcome).toBe('skipped');
  });

  it('a teammate who guesses cannot tap „uhodli“', () => {
    const s = act(started(), { type: 'startTurn', difficulty: 3 });
    expect(applyAktivity(s, { type: 'guessed', by: as('kuba'), now: T0 })).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('another team cannot take the points of a normal card', () => {
    const s = act(started(), { type: 'startTurn', difficulty: 3 });
    expect(s.current!.allPlay).toBe(false);
    expect(applyAktivity(s, { type: 'guessed', teamId: 'cerveni', by: HOST, now: T0 })).toMatchObject({
      ok: false,
      error: 'forbidden',
    });
  });
});

describe('deadline', () => {
  const playing = () => act(act(newGame({ timerSeconds: 30 }), { type: 'start' }), { type: 'startTurn', difficulty: 4 });

  it('timeout before the deadline is refused', () => {
    const s = playing();
    expect(applyAktivity(s, { type: 'timeout', by: SYSTEM, now: T0 + 29_999 })).toMatchObject({ ok: false, error: 'notYet' });
  });

  it('timeout at the deadline ends the turn without points', () => {
    const s = act(playing(), { type: 'timeout' }, SYSTEM, T0 + 30_000);
    expect(s.phase).toBe('result');
    expect(s.deadline).toBeNull();
    expect(s.history[0]).toMatchObject({ outcome: 'timeout', points: 0 });
  });

  it('only the system sends timeout', () => {
    expect(applyAktivity(playing(), { type: 'timeout', by: HOST, now: T0 + 40_000 })).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('a late „uhodli“ counts within the grace period, not after', () => {
    const s = playing();
    expect(applyAktivity(s, { type: 'guessed', by: HOST, now: T0 + 30_000 + GUESS_GRACE_MS }).ok).toBe(true);
    expect(applyAktivity(s, { type: 'guessed', by: HOST, now: T0 + 30_001 + GUESS_GRACE_MS })).toMatchObject({
      ok: false,
      error: 'timeUp',
    });
  });

  it('the timer is configurable in setup only', () => {
    const s = act(newGame(), { type: 'configure', timerSeconds: 90 });
    expect(s.config.timerSeconds).toBe(90);
    expect(applyAktivity(s, { type: 'configure', timerSeconds: 3, by: HOST, now: T0 })).toMatchObject({ ok: false, error: 'invalidConfig' });
    const started = act(s, { type: 'start' });
    expect(applyAktivity(started, { type: 'configure', timerSeconds: 30, by: HOST, now: T0 })).toMatchObject({
      ok: false,
      error: 'wrongPhase',
    });
  });
});

describe('all-play card', () => {
  it('lets any team take the points', () => {
    let s = act(newGame({ allPlayChance: 1 }), { type: 'start' });
    s = act(s, { type: 'startTurn', difficulty: 3 });
    expect(s.current!.allPlay).toBe(true);
    s = act(s, { type: 'guessed', teamId: 'cerveni' });
    expect(s.scores).toEqual({ modri: 0, cerveni: 3 });
    expect(s.history[0].scoringTeamId).toBe('cerveni');
  });

  it('rejects an unknown team', () => {
    let s = act(newGame({ allPlayChance: 1 }), { type: 'start' });
    s = act(s, { type: 'startTurn', difficulty: 3 });
    expect(applyAktivity(s, { type: 'guessed', teamId: 'zeleni', by: HOST, now: T0 })).toMatchObject({ ok: false, error: 'unknownTeam' });
  });
});

describe('viewFor', () => {
  const playing = () => act(act(newGame(), { type: 'start' }), { type: 'startTurn', difficulty: 4 });

  it('shows the word only to the explainer while playing', () => {
    const s = playing();
    const word = s.cards[s.current!.cardId!].word;
    const explainer = viewFor(s, { role: 'contestant', contestantId: 'tata' });
    expect(explainer.youExplain).toBe(true);
    expect(explainer.secret?.word).toBe(word);
    expect(explainer.secret?.forbidden).toEqual(['zakázané']);
    for (const v of [
      viewFor(s, { role: 'host' }),
      viewFor(s, { role: 'spectator' }),
      viewFor(s, { role: 'contestant', contestantId: 'kuba' }),
      viewFor(s, { role: 'contestant', contestantId: 'mama' }),
    ]) {
      expect(v.secret).toBeNull();
      expect(JSON.stringify(v)).not.toContain(word);
      expect(JSON.stringify(v)).not.toContain(s.current!.cardId!);
      // Mode and difficulty are public: the team must know how it is explained.
      expect(v.current?.mode).toBe(s.current!.mode);
    }
  });

  it('reveals the word to everyone once the turn ends', () => {
    const s = act(playing(), { type: 'skip' });
    const word = s.cards[s.history[0].cardId].word;
    const tv = viewFor(s, { role: 'host' });
    expect(tv.secret).toBeNull();
    expect(tv.history[0].word).toBe(word);
  });

  it('shows the picture and word to the preschooler and the adult helper', () => {
    let s = act(newGame(), { type: 'start' });
    s = playTurn(s, 'skip');
    s = playTurn(s, 'skip');
    s = act(s, { type: 'startTurn', difficulty: 3 });
    expect(viewFor(s, { role: 'contestant', contestantId: 'kuba' }).secret?.image).toBe('🐸');
    expect(viewFor(s, { role: 'contestant', contestantId: 'tata' }).secret?.word).toBe(s.cards[s.current!.cardId!].word);
    expect(viewFor(s, { role: 'host' }).secret).toBeNull();
  });
});

describe('determinism and draw', () => {
  function run(seed: number): string[] {
    let s = act(newGame({ seed, goal: { kind: 'rounds', rounds: 5 }, allPlayChance: 0.5 }), { type: 'start' });
    const log: string[] = [];
    while (s.phase !== 'finished') {
      s = act(s, { type: 'startTurn', difficulty: 4 });
      log.push(`${s.current!.cardId}:${s.current!.mode}:${s.current!.allPlay}`);
      s = act(act(s, { type: 'skip' }), { type: 'next' });
    }
    return log;
  }

  it('the same seed gives the same cards, modes and all-play turns', () => {
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('never repeats a card within a game', () => {
    const ids = run(3).map((l) => l.split(':')[0]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never repeats a word that sits in two levels', () => {
    const twin: AktivityCard[] = [
      { id: 'hospoda-001', level: 'hospoda', word: 'Houba', mode: 'nakresli', difficulty: 3 },
      { id: 'hospoda-002', level: 'hospoda', word: 'kapr', mode: 'nakresli', difficulty: 3 },
      { id: 'lavice-001', level: 'lavice', word: 'houba', mode: 'nakresli', difficulty: 3 },
      { id: 'lavice-002', level: 'lavice', word: 'kolo', mode: 'nakresli', difficulty: 3 },
    ];
    const t: AktivityTeam[] = [
      { id: 'a', name: 'A', players: [{ id: 'a1', name: 'A1', level: 'hospoda' }, { id: 'a2', name: 'A2', level: 'hospoda' }] },
      { id: 'b', name: 'B', players: [{ id: 'b1', name: 'B1', level: 'lavice' }, { id: 'b2', name: 'B2', level: 'lavice' }] },
    ];
    let s = act(createAktivity({ seed: 1, teams: t, goal: { kind: 'rounds', rounds: 10 } }, twin), { type: 'start' });
    const words: string[] = [];
    for (;;) {
      const r = applyAktivity(s, { type: 'startTurn', difficulty: 3, by: HOST, now: T0 });
      if (!r.ok) {
        expect(r.error).toBe('deckEmpty');
        break;
      }
      words.push(r.state.cards[r.state.current!.cardId!].word.toLowerCase());
      s = act(act(r.state, { type: 'skip' }), { type: 'next' });
    }
    // Four cards, three distinct words: „houba“ is played once.
    expect(words.sort()).toEqual(['houba', 'kapr', 'kolo']);
  });

  it('falls back to another difficulty, then reports an empty deck', () => {
    const tiny: AktivityCard[] = [{ id: 'hospoda-001', level: 'hospoda', word: 'kapr', mode: 'ukaz', difficulty: 3 }];
    const t: AktivityTeam[] = [
      { id: 'a', name: 'A', players: [{ id: 'a1', name: 'A1', level: 'hospoda' }, { id: 'a2', name: 'A2', level: 'hospoda' }] },
      { id: 'b', name: 'B', players: [{ id: 'b1', name: 'B1', level: 'hospoda' }, { id: 'b2', name: 'B2', level: 'hospoda' }] },
    ];
    let s = act(createAktivity({ seed: 1, teams: t }, tiny), { type: 'start' });
    s = act(s, { type: 'startTurn', difficulty: 5 });
    expect(s.current!.cardId).toBe('hospoda-001');
    s = act(act(s, { type: 'guessed' }), { type: 'next' });
    expect(s.scores.a).toBe(3);
    expect(applyAktivity(s, { type: 'startTurn', difficulty: 3, by: HOST, now: T0 })).toMatchObject({ ok: false, error: 'deckEmpty' });
  });
});

describe('end of game', () => {
  it('ends after the configured number of rounds', () => {
    let s = act(newGame({ goal: { kind: 'rounds', rounds: 2 } }), { type: 'start' });
    for (let i = 0; i < 3; i++) s = playTurn(s, 'skip');
    expect(s.phase).toBe('turnIntro');
    s = playTurn(s, 'skip');
    expect(s.phase).toBe('finished');
    expect(s.history).toHaveLength(4);
  });

  it('ends at the end of the round in which a team reaches the target', () => {
    let s = act(newGame({ goal: { kind: 'points', points: 5 } }), { type: 'start' });
    s = act(act(s, { type: 'startTurn', difficulty: 5 }), { type: 'guessed' });
    expect(s.scores.modri).toBe(5);
    s = act(s, { type: 'next' });
    // The other team still gets its turn in the round.
    expect(s.phase).toBe('turnIntro');
    expect(s.current!.teamId).toBe('cerveni');
    s = playTurn(s, 'skip');
    expect(s.phase).toBe('finished');
    expect(viewFor(s, { role: 'host' }).winners).toEqual(['modri']);
  });

  it('host can end the game early; a running turn is dropped', () => {
    let s = act(act(newGame(), { type: 'start' }), { type: 'startTurn', difficulty: 3 });
    s = act(s, { type: 'end' });
    expect(s.phase).toBe('finished');
    expect(s.history).toHaveLength(0);
    expect(applyAktivity(s, { type: 'next', by: HOST, now: T0 })).toMatchObject({ ok: false, error: 'wrongPhase' });
  });

  it('refused actions leave the state unchanged in the reducer form', () => {
    const s = newGame();
    expect(reduceAktivity(s, { type: 'start', by: as('tata'), now: T0 })).toBe(s);
  });
});

describe('aktivityToMatchResult', () => {
  it('ranks teams by points with shared places', () => {
    let s = act(newGame({ goal: { kind: 'rounds', rounds: 1 } }), { type: 'start' });
    s = act(act(act(s, { type: 'startTurn', difficulty: 4 }), { type: 'guessed' }), { type: 'next' });
    s = act(act(act(s, { type: 'startTurn', difficulty: 4 }), { type: 'guessed' }), { type: 'next' });
    expect(s.phase).toBe('finished');
    const r = aktivityToMatchResult(s, '2026-10-25T20:00:00Z');
    expect(r).toMatchObject({ matchId: 'g1', gameType: 'aktivity', playedAt: '2026-10-25T20:00:00Z', nightId: null });
    expect(r.participants).toEqual([
      { participantId: 'modri', kind: 'team', memberIds: ['tata', 'kuba'], place: 1, score: 4 },
      { participantId: 'cerveni', kind: 'team', memberIds: ['mama', 'anicka', 'babi'], place: 1, score: 4 },
    ]);
  });

  it('winner first, then the rest', () => {
    let s = act(newGame({ goal: { kind: 'rounds', rounds: 1 } }), { type: 'start' });
    s = playTurn(s, 'skip');
    s = act(act(act(s, { type: 'startTurn', difficulty: 3 }), { type: 'guessed' }), { type: 'next' });
    expect(aktivityStandings(s).map((r) => [r.teamId, r.place])).toEqual([
      ['cerveni', 1],
      ['modri', 2],
    ]);
  });
});
