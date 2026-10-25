import { describe, expect, it } from 'vitest';
import {
  applyClovece,
  createCloveceGame,
  currentMoves,
  fieldOf,
  legalMoves,
  peekRoll,
  replayClovece,
  toMatchResult,
  TRACK,
  viewFor,
  withNextRoll,
  YARD,
  type CloveceCommand,
  type CloveceSettings,
  type CloveceState,
} from '../../../src/lib/games/clovece/engine.ts';

const PLAYERS = [
  { id: 'a', name: 'Anna' },
  { id: 'b', name: 'Bára' },
];

function game(settings: Partial<CloveceSettings> = {}, players = PLAYERS, seed = 11): CloveceState {
  return createCloveceGame({ id: 'g1', createdAt: '2026-10-25T10:00:00.000Z', seed, players, settings });
}

function act(state: CloveceState, command: CloveceCommand, by: string = state.turn): CloveceState {
  const r = applyClovece(state, { ...command, by: { role: 'contestant', contestantId: by }, now: 1000 });
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r.state;
}

/** Rolls the given value (the die is set up so that the next roll gives it). */
function roll(state: CloveceState, value: number): CloveceState {
  return act(withNextRoll(state, value), { type: 'roll' });
}

function setPawns(state: CloveceState, pawns: number[][]): CloveceState {
  const s = { ...state, pawns: pawns.map((p) => [...p]) };
  return { ...s, tries: s.settings.threeTries && !pawns[s.players.findIndex((p) => p.id === s.turn)].some((r) => r >= 0 && r < TRACK) ? 3 : 1 };
}

describe('setup', () => {
  it('gives two players opposite colours and every pawn starts in the yard', () => {
    const s = game();
    expect(s.players.map((p) => p.color)).toEqual(['red', 'green']);
    expect(s.pawns).toEqual([[-1, -1, -1, -1], [-1, -1, -1, -1]]);
    expect(s.turn).toBe('a');
    expect(s.tries).toBe(3);
  });

  it('uses all four colours for four players and two pawns in the short game', () => {
    const s = game({ pawns: 2 }, [...PLAYERS, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }]);
    expect(s.players.map((p) => p.color)).toEqual(['red', 'blue', 'green', 'yellow']);
    expect(s.pawns[3]).toEqual([-1, -1]);
  });

  it('refuses one or five players', () => {
    expect(() => game({}, [PLAYERS[0]])).toThrow();
    expect(() => game({}, [1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, name: `P${n}` })))).toThrow();
  });

  it('rolls the same numbers for the same seed', () => {
    const a = peekRoll(123);
    const b = peekRoll(123);
    expect(a).toEqual(b);
    expect(a.value).toBeGreaterThanOrEqual(1);
    expect(a.value).toBeLessThanOrEqual(6);
  });
});

describe('entering with a six', () => {
  it('a six lets a pawn onto the start field and the player rolls again', () => {
    let s = roll(game(), 6);
    expect(s.stage).toBe('move');
    expect(currentMoves(s).map((m) => m.kind)).toEqual(['enter', 'enter', 'enter', 'enter']);
    s = act(s, { type: 'move', pawn: 0 });
    expect(s.pawns[0][0]).toBe(0);
    expect(s.turn).toBe('a');
    expect(s.stage).toBe('roll');
    // A pawn is on the ring now, so only one roll.
    expect(s.tries).toBe(1);
  });

  it('a one does not enter in the classic game, but does with the variant', () => {
    expect(legalMoves(game(), 'a', 1)).toEqual([]);
    expect(legalMoves(game({ enterOnOne: true }), 'a', 1).map((m) => m.kind)).toContain('enter');
  });

  it('the own start field blocks entering', () => {
    const s = setPawns(game(), [[0, -1, -1, -1], [-1, -1, -1, -1]]);
    expect(legalMoves(s, 'a', 6).map((m) => m.pawn)).toEqual([0]);
  });
});

describe('three tries', () => {
  it('without a pawn on the ring the player rolls up to three times for a six', () => {
    let s = roll(game(), 3);
    expect(s.turn).toBe('a');
    expect(s.tries).toBe(2);
    s = roll(s, 2);
    expect(s.turn).toBe('a');
    s = roll(s, 5);
    expect(s.turn).toBe('b');
    expect(s.tries).toBe(3);
  });

  it('with the variant off there is a single try', () => {
    const s = roll(game({ threeTries: false }), 3);
    expect(s.turn).toBe('b');
  });

  it('a pawn on the ring means one roll', () => {
    const s = setPawns(game(), [[5, -1, -1, -1], [-1, -1, -1, -1]]);
    expect(s.tries).toBe(1);
    const after = act(roll(s, 2), { type: 'move', pawn: 0 });
    expect(after.pawns[0][0]).toBe(7);
    expect(after.turn).toBe('b');
  });
});

describe('moving and capturing', () => {
  it('a six on the ring moves and rolls again', () => {
    let s = setPawns(game(), [[3, 0, -1, -1], [-1, -1, -1, -1]]);
    s = act(roll(s, 6), { type: 'move', pawn: 0 });
    expect(s.pawns[0][0]).toBe(9);
    expect(s.turn).toBe('a');
    expect(s.stage).toBe('roll');
  });

  it('may jump over own pawns on the ring but not land on them', () => {
    const s = setPawns(game(), [[3, 5, -1, -1], [-1, -1, -1, -1]]);
    expect(legalMoves(s, 'a', 2).map((m) => m.pawn)).toEqual([1]);
    expect(legalMoves(s, 'a', 4).map((m) => m.pawn)).toEqual([0, 1]);
  });

  it('landing on an opponent sends it back to its yard', () => {
    // Green starts on field 20, so its relative 5 is field 25 = red relative 25.
    let s = setPawns(game(), [[22, -1, -1, -1], [5, -1, -1, -1]]);
    expect(fieldOf('green', 5)).toBe(25);
    s = roll(s, 3);
    expect(currentMoves(s)[0].captures).toEqual({ playerId: 'b', pawn: 0 });
    s = act(s, { type: 'move', pawn: 0 });
    expect(s.pawns[1][0]).toBe(YARD);
    expect(s.lastMove?.captured).toEqual({ playerId: 'b', pawn: 0, from: 5 });
    expect(s.log.some((e) => e.type === 'capture')).toBe(true);
  });

  it('entering onto a start field with an opponent captures it', () => {
    // Red pawn on green's start (field 20 = red relative 20); green rolls a six and enters.
    let s = setPawns(game(), [[20, -1, -1, -1], [-1, -1, -1, -1]]);
    s = { ...s, turn: 'b', tries: 3 };
    s = act(roll(s, 6), { type: 'move', pawn: 0 }, 'b');
    expect(s.pawns[1][0]).toBe(0);
    expect(s.pawns[0][0]).toBe(YARD);
  });

  it('without capturing, pawns share the field', () => {
    let s = setPawns(game({ capture: false }), [[22, -1, -1, -1], [5, -1, -1, -1]]);
    s = act(roll(s, 3), { type: 'move', pawn: 0 });
    expect(s.pawns[0][0]).toBe(25);
    expect(s.pawns[1][0]).toBe(5);
  });
});

describe('home', () => {
  it('needs an exact roll into the home', () => {
    const s = setPawns(game(), [[38, -1, -1, -1], [-1, -1, -1, -1]]);
    expect(legalMoves(s, 'a', 5).map((m) => m.to)).toEqual([43]);
    expect(legalMoves(s, 'a', 6).filter((m) => m.pawn === 0)).toEqual([]);
  });

  it('may not jump over its own pawn inside the home', () => {
    const s = setPawns(game(), [[39, 41, -1, -1], [-1, -1, -1, -1]]);
    // 39 + 3 = 42 would jump over 41.
    expect(legalMoves(s, 'a', 3)).toEqual([]);
    expect(legalMoves(s, 'a', 1).map((m) => m.to)).toEqual([40, 42]);
  });

  it('too big a roll with nothing else to move passes the turn', () => {
    let s = setPawns(game(), [[42, 43, 41, 39], [5, -1, -1, -1]]);
    s = roll(s, 5);
    expect(s.turn).toBe('b');
  });
});

describe('end and places', () => {
  it('a player with every pawn home gets a place; with one left the game ends', () => {
    let s = setPawns(game({ pawns: 2 }), [[43, 38], [5, -1]]);
    s = act(roll(s, 4), { type: 'move', pawn: 1 });
    expect(s.finished).toEqual(['a', 'b']);
    expect(s.phase).toBe('finished');
    const result = toMatchResult(s, '2026-10-25T12:00:00.000Z');
    expect(result.gameType).toBe('clovece');
    expect(result.participants.map((p) => [p.participantId, p.place, p.score])).toEqual([
      ['a', 1, 2],
      ['b', 2, 0],
    ]);
    expect(applyClovece(s, { type: 'roll', by: { role: 'system' }, now: 0 }).ok).toBe(false);
  });

  it('plays on for the other places with three players', () => {
    const three = [...PLAYERS, { id: 'c', name: 'Cyril' }];
    let s = setPawns(game({ pawns: 2 }, three), [[43, 38], [5, -1], [3, -1]]);
    s = act(roll(s, 4), { type: 'move', pawn: 1 });
    expect(s.finished).toEqual(['a']);
    expect(s.phase).toBe('playing');
    expect(s.turn).toBe('b');
  });

  it('a finished player is skipped', () => {
    const three = [...PLAYERS, { id: 'c', name: 'Cyril' }];
    let s = setPawns(game({ pawns: 2 }, three), [[5, -1], [43, 42], [3, -1]]);
    s = { ...s, finished: ['b'] };
    s = act(roll(s, 2), { type: 'move', pawn: 0 });
    expect(s.turn).toBe('c');
  });
});

describe('reducer guards', () => {
  it('refuses moves out of turn, before rolling and illegal pawns', () => {
    const s = game();
    expect(applyClovece(s, { type: 'roll', by: { role: 'contestant', contestantId: 'b' }, now: 0 })).toMatchObject({ ok: false, error: 'notYourTurn' });
    expect(applyClovece(s, { type: 'roll', by: { role: 'contestant', contestantId: 'x' }, now: 0 })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(applyClovece(s, { type: 'move', pawn: 0, by: { role: 'host' }, now: 0 })).toMatchObject({ ok: false, error: 'rollFirst' });
    const rolled = roll(s, 6);
    expect(applyClovece(rolled, { type: 'roll', by: { role: 'host' }, now: 0 })).toMatchObject({ ok: false, error: 'alreadyRolled' });
    expect(applyClovece(rolled, { type: 'move', pawn: 7, by: { role: 'host' }, now: 0 })).toMatchObject({ ok: false, error: 'illegalMove' });
  });

  it('does not change the input state', () => {
    const s = setPawns(game(), [[3, -1, -1, -1], [-1, -1, -1, -1]]);
    const copy = JSON.parse(JSON.stringify(s));
    act(roll(s, 2), { type: 'move', pawn: 0 });
    expect(s).toEqual(copy);
  });

  it('state survives JSON and a replay of its history', () => {
    let s = game({}, PLAYERS, 99);
    for (let n = 0; n < 60 && s.phase === 'playing'; n++) {
      const moves = currentMoves(s);
      s = act(s, s.stage === 'roll' ? { type: 'roll' } : { type: 'move', pawn: moves[0].pawn });
    }
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    const replayed = replayClovece({ id: 'g1', createdAt: '2026-10-25T10:00:00.000Z', seed: 99, players: PLAYERS }, s.history);
    expect(replayed.pawns).toEqual(s.pawns);
    expect(replayed.rng).toBe(s.rng);
  });
});

describe('viewFor', () => {
  it('hides the die state and shows the moves of the player on turn', () => {
    const s = roll(game(), 6);
    const v = viewFor(s, { role: 'contestant', contestantId: 'b' });
    expect('rng' in v).toBe(false);
    expect('history' in v).toBe(false);
    expect('seed' in v).toBe(false);
    expect(v.me).toBe('b');
    expect(v.myColor).toBe('green');
    expect(v.moves).toHaveLength(4);
    expect(viewFor(s, { role: 'host' }).me).toBeNull();
  });
});
