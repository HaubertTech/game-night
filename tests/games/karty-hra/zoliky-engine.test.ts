import { describe, expect, it } from 'vitest';
import { zolikyDeck } from '../../../src/lib/games/karty-hra/cards.ts';
import {
  applyZoliky,
  createZolikyGame,
  toMatchResult,
  totals,
  viewFor,
  type ZolikyCommand,
  type ZolikyGameState,
  type ZolikyResult,
} from '../../../src/lib/games/karty-hra/zoliky-engine.ts';
import {
  analyzeMeld,
  checkOpening,
  handPoints,
  layOff,
  meldValue,
  planMelds,
  swapJoker,
} from '../../../src/lib/games/karty-hra/zoliky-melds.ts';

const PLAYERS = [
  { id: 'a', name: 'Anna' },
  { id: 'b', name: 'Bára' },
  { id: 'c', name: 'Cyril' },
];

function game(seed = 3, players = PLAYERS, settings = {}) {
  return createZolikyGame({ id: 'z1', createdAt: '2026-10-25T10:00:00.000Z', seed, players, settings });
}

/** A fixed table in the play step of `turn` (after drawing). */
function table(hands: Record<string, string[]>, extra: Partial<ZolikyGameState> = {}): ZolikyGameState {
  const base = game();
  const used = new Set(Object.values(hands).flat());
  const stock = zolikyDeck().filter((c) => !used.has(c));
  const turn = extra.turn ?? 'a';
  const state: ZolikyGameState = {
    ...base,
    hands,
    stock,
    discard: ['kary-9-1'],
    melds: [],
    opened: { a: false, b: false, c: false },
    turn,
    step: 'play',
    tookDiscard: null,
    openedBefore: false,
    ...extra,
  };
  return { ...state, snapshot: { hand: [...state.hands[turn]], melds: state.melds, opened: !!state.opened[turn], meldSeq: state.meldSeq } };
}

function act(state: ZolikyGameState, by: string, command: ZolikyCommand): ZolikyResult {
  return applyZoliky(state, { ...command, by: { role: 'contestant', contestantId: by }, now: 1 });
}

function ok(result: ZolikyResult): ZolikyGameState {
  if (!result.ok) throw new Error(`refused: ${result.error} ${result.detail ?? ''}`);
  return result.state;
}

describe('žolíky — balíček a rozdání', () => {
  it('108 cards: two decks and four jokers', () => {
    const deck = zolikyDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck).size).toBe(108);
    expect(deck.filter((c) => c.startsWith('zolik-'))).toHaveLength(4);
  });

  it('three players get 14 cards, the starter one more and starts by discarding', () => {
    const s = game();
    expect(s.hands.a).toHaveLength(15);
    expect(s.hands.b).toHaveLength(14);
    expect(s.hands.c).toHaveLength(14);
    expect(s.turn).toBe('a');
    expect(s.step).toBe('play');
    expect([...Object.values(s.hands).flat(), ...s.stock]).toHaveLength(108);
  });
});

describe('žolíky — kombinace', () => {
  it('a run in one suit, also with the ace below or above', () => {
    expect(analyzeMeld(['srdce-5-0', 'srdce-6-0', 'srdce-7-1']).ok).toBe(true);
    expect(analyzeMeld(['piky-1-0', 'piky-2-0', 'piky-3-0']).ok).toBe(true);
    expect(analyzeMeld(['piky-12-0', 'piky-13-0', 'piky-1-0']).ok).toBe(true);
    expect(analyzeMeld(['piky-13-0', 'piky-1-0', 'piky-2-0']).ok).toBe(false);
  });

  it('a group of three or four of one rank in different suits', () => {
    expect(analyzeMeld(['srdce-9-0', 'kary-9-0', 'piky-9-1']).ok).toBe(true);
    expect(analyzeMeld(['srdce-9-0', 'kary-9-0', 'piky-9-1', 'krize-9-0']).ok).toBe(true);
    const dup = analyzeMeld(['srdce-9-0', 'srdce-9-1', 'piky-9-1']);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe('duplicateSuit');
  });

  it('rejects mixed suits, short sets and gaps', () => {
    expect(analyzeMeld(['srdce-5-0', 'kary-6-0', 'srdce-7-1']).ok).toBe(false);
    expect(analyzeMeld(['srdce-5-0', 'srdce-6-0']).ok).toBe(false);
    expect(analyzeMeld(['srdce-5-0', 'srdce-6-0', 'srdce-9-0']).ok).toBe(false);
  });

  it('a joker fills a gap or extends a run, but at least two real cards are needed', () => {
    const gap = analyzeMeld(['srdce-5-0', 'zolik-0', 'srdce-7-0']);
    expect(gap.ok).toBe(true);
    if (gap.ok) expect(gap.shape.slots.map((s) => s.rank)).toEqual([5, 6, 7]);
    const end = analyzeMeld(['srdce-12-0', 'srdce-13-0', 'zolik-1']);
    expect(end.ok).toBe(true);
    if (end.ok) expect(end.shape.slots[2].rank).toBe(14);
    expect(analyzeMeld(['srdce-5-0', 'zolik-0', 'zolik-1']).ok).toBe(false);
    expect(analyzeMeld(['srdce-9-0', 'kary-9-0', 'zolik-2']).ok).toBe(true);
    expect(analyzeMeld(['srdce-9-0', 'kary-9-0', 'zolik-2', 'zolik-3', 'piky-9-0']).ok).toBe(false);
  });

  it('values: joker counts as the card it stands for, ace below the two is 1', () => {
    const run = analyzeMeld(['kary-10-0', 'zolik-0', 'kary-12-0']);
    if (!run.ok) throw new Error('run');
    expect(meldValue(run.shape)).toBe(30);
    const low = analyzeMeld(['kary-1-0', 'kary-2-0', 'kary-3-0']);
    if (!low.ok) throw new Error('low');
    expect(meldValue(low.shape)).toBe(6);
    expect(handPoints(['zolik-0', 'srdce-1-0', 'srdce-13-0', 'srdce-5-0'])).toBe(50 + 10 + 10 + 5);
  });
});

describe('žolíky — první vyložení', () => {
  it('needs at least 42 points', () => {
    const low = checkOpening([['srdce-2-0', 'srdce-3-0', 'srdce-4-0'], ['kary-9-0', 'piky-9-0', 'krize-9-0']], { min: 42, requirePureRun: true });
    expect(low.points).toBe(36);
    expect(low.ok).toBe(false);
    const enough = checkOpening([['srdce-11-0', 'srdce-12-0', 'srdce-13-0'], ['kary-4-0', 'piky-4-0', 'krize-4-0']], { min: 42, requirePureRun: true });
    expect(enough.points).toBe(42);
    expect(enough.ok).toBe(true);
  });

  it('needs a pure run (no joker)', () => {
    const r = checkOpening([['srdce-11-0', 'zolik-0', 'srdce-13-0'], ['kary-10-0', 'piky-10-0', 'krize-10-0']], { min: 42, requirePureRun: true });
    expect(r.points).toBe(60);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/čistá postupka/);
  });

  it('the reducer refuses an opening below the minimum and accepts one above', () => {
    const s = table({
      a: ['srdce-3-0', 'srdce-4-0', 'srdce-5-0', 'kary-11-0', 'kary-12-0', 'kary-13-0', 'piky-12-0', 'piky-5-0'],
      b: ['krize-2-0'],
      c: ['krize-3-0'],
    });
    const low = act(s, 'a', { type: 'meld', melds: [['srdce-3-0', 'srdce-4-0', 'srdce-5-0']] });
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.error).toBe('opening');
    const t = ok(act(s, 'a', { type: 'meld', melds: [['srdce-3-0', 'srdce-4-0', 'srdce-5-0'], ['kary-11-0', 'kary-12-0', 'kary-13-0']] }));
    expect(t.opened.a).toBe(true);
    expect(t.melds).toHaveLength(2);
    expect(t.hands.a).toEqual(['piky-12-0', 'piky-5-0']);
  });

  it('may not lay off before the first lay-down', () => {
    const s = table(
      { a: ['srdce-8-0', 'piky-5-0'], b: ['krize-2-0'], c: ['krize-3-0'] },
      { melds: [{ id: 'm1', owner: 'b', kind: 'run', slots: [5, 6, 7].map((r) => ({ id: `srdce-${r}-1`, rank: r, suit: 'srdce' as const, joker: false })) }], opened: { a: false, b: true, c: false } },
    );
    const r = act(s, 'a', { type: 'layOff', meldId: 'm1', cardIds: ['srdce-8-0'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('notOpened');
  });
});

describe('žolíky — braní z odhozených', () => {
  it('before laying down the taken card must be laid down in the same turn', () => {
    const s = table(
      { a: ['srdce-11-0', 'srdce-12-0', 'kary-10-0', 'piky-10-0', 'krize-10-0', 'piky-3-0', 'kary-2-0'], b: ['krize-2-0'], c: ['krize-3-0'] },
      { step: 'draw', discard: ['srdce-13-0'] },
    );
    let t = ok(act(s, 'a', { type: 'takeDiscard' }));
    expect(t.tookDiscard).toBe('srdce-13-0');
    const early = act(t, 'a', { type: 'discard', cardId: 'piky-3-0' });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error).toBe('mustUseDiscard');
    t = ok(act(t, 'a', { type: 'meld', melds: [['srdce-11-0', 'srdce-12-0', 'srdce-13-0'], ['kary-10-0', 'piky-10-0', 'krize-10-0']] }));
    t = ok(act(t, 'a', { type: 'discard', cardId: 'piky-3-0' }));
    expect(t.turn).toBe('b');
  });
});

describe('žolíky — přikládání a výměna žolíka', () => {
  const run = analyzeMeld(['srdce-5-0', 'zolik-0', 'srdce-7-0']);
  if (!run.ok) throw new Error('run');

  it('lays off at either end of a run, keeping the joker in place', () => {
    const r = layOff(run.shape, ['srdce-8-1', 'srdce-4-1']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.shape.slots.map((s) => s.rank)).toEqual([4, 5, 6, 7, 8]);
    expect(layOff(run.shape, ['kary-8-1']).ok).toBe(false);
  });

  it('exchanges a joker in a run for the card it stands for', () => {
    const r = swapJoker(run.shape, ['srdce-6-1']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.freed).toEqual(['zolik-0']);
      expect(r.shape.slots.every((s) => !s.joker)).toBe(true);
    }
    expect(swapJoker(run.shape, ['srdce-8-1']).ok).toBe(false);
  });

  it('a joker in a group comes back only for all missing suits', () => {
    const group = analyzeMeld(['srdce-9-0', 'kary-9-0', 'zolik-1']);
    if (!group.ok) throw new Error('group');
    expect(swapJoker(group.shape, ['piky-9-0']).ok).toBe(false);
    const r = swapJoker(group.shape, ['piky-9-0', 'krize-9-0']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.shape.slots).toHaveLength(4);
  });

  it('the reducer gives the joker back to the hand', () => {
    const s = table(
      { a: ['srdce-6-1', 'piky-5-0', 'piky-9-0'], b: ['krize-2-0'], c: ['krize-3-0'] },
      { melds: [{ ...run.shape, id: 'm1', owner: 'b' }], opened: { a: true, b: true, c: false }, openedBefore: true },
    );
    const t = ok(act(s, 'a', { type: 'swapJoker', meldId: 'm1', cardIds: ['srdce-6-1'] }));
    expect(t.hands.a).toContain('zolik-0');
    expect(t.hands.a).not.toContain('srdce-6-1');
  });
});

describe('žolíky — zavření a body (domácí pravidla)', () => {
  it('closing: the closer has 0, the others the points in hand', () => {
    const s = table(
      { a: ['piky-5-0'], b: ['zolik-2', 'srdce-1-0'], c: ['kary-7-0', 'krize-13-0'] },
      { opened: { a: true, b: true, c: false }, openedBefore: true },
    );
    const t = ok(act(s, 'a', { type: 'discard', cardId: 'piky-5-0' }));
    expect(t.phase).toBe('roundEnd');
    expect(t.lastRound).toMatchObject({ winnerId: 'a', fromHand: false, points: { a: 0, b: 60, c: 17 } });
    expect(totals(t)).toEqual({ a: 0, b: 60, c: 17 });
  });

  it('closing from hand doubles the others’ points', () => {
    const s = table({
      a: ['srdce-11-0', 'srdce-12-0', 'srdce-13-0', 'kary-10-0', 'piky-10-0', 'krize-10-0', 'piky-3-0'],
      b: ['kary-5-0', 'krize-6-0'],
      c: ['zolik-3'],
    });
    let t = ok(act(s, 'a', { type: 'meld', melds: [['srdce-11-0', 'srdce-12-0', 'srdce-13-0'], ['kary-10-0', 'piky-10-0', 'krize-10-0']] }));
    t = ok(act(t, 'a', { type: 'discard', cardId: 'piky-3-0' }));
    expect(t.lastRound).toMatchObject({ winnerId: 'a', fromHand: true, points: { a: 0, b: 22, c: 100 } });
  });

  it('a meld that would leave no card to discard is refused', () => {
    const s = table({ a: ['srdce-11-0', 'srdce-12-0', 'srdce-13-0', 'kary-10-0', 'piky-10-0', 'krize-10-0'], b: ['kary-5-0'], c: ['krize-6-0'] });
    const r = act(s, 'a', { type: 'meld', melds: [['srdce-11-0', 'srdce-12-0', 'srdce-13-0'], ['kary-10-0', 'piky-10-0', 'krize-10-0']] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('keepDiscard');
  });

  it('the game ends after the set number of rounds, lowest total wins', () => {
    let s = game(3, PLAYERS.slice(0, 2), { rounds: 2 });
    for (let round = 0; round < 2; round++) {
      s = { ...s, hands: { a: ['piky-5-0'], b: ['srdce-1-0', 'kary-10-0'] }, opened: { a: true, b: true }, openedBefore: true, turn: 'a', step: 'play' };
      s = ok(act(s, 'a', { type: 'discard', cardId: 'piky-5-0' }));
      if (round === 0) s = ok(applyZoliky(s, { type: 'nextRound', by: { role: 'host' }, now: 2 }));
    }
    expect(s.phase).toBe('finished');
    const result = toMatchResult(s);
    expect(result.gameType).toBe('zoliky');
    expect(result.participants[0]).toMatchObject({ participantId: 'a', place: 1, score: 0 });
    expect(result.participants[1]).toMatchObject({ participantId: 'b', place: 2, score: 40 });
  });

  it('resetTurn returns the hand and the table to the start of the turn', () => {
    const s = table(
      { a: ['srdce-6-1', 'piky-5-0', 'piky-9-0'], b: ['krize-2-0'], c: ['krize-3-0'] },
      { melds: [{ ...run(), id: 'm1', owner: 'b' }], opened: { a: true, b: true, c: false }, openedBefore: true },
    );
    const t = ok(act(s, 'a', { type: 'swapJoker', meldId: 'm1', cardIds: ['srdce-6-1'] }));
    const back = ok(act(t, 'a', { type: 'resetTurn' }));
    expect(back.hands.a).toEqual(s.hands.a);
    expect(back.melds).toEqual(s.melds);
  });
});

function run() {
  const r = analyzeMeld(['srdce-5-0', 'zolik-0', 'srdce-7-0']);
  if (!r.ok) throw new Error('run');
  return r.shape;
}

describe('žolíky — hledání kombinací', () => {
  it('finds the best split of a hand and a valid first lay-down', () => {
    const hand = ['srdce-11-0', 'srdce-12-0', 'srdce-13-0', 'kary-10-0', 'piky-10-0', 'krize-10-0', 'piky-3-0', 'zolik-0', 'kary-5-0', 'kary-6-0'];
    const { best, opening } = planMelds(hand, { opening: { min: 42, requirePureRun: true } });
    expect(best.rest).toEqual(['piky-3-0']);
    expect(opening).not.toBeNull();
    expect(opening!.value).toBeGreaterThanOrEqual(42);
    for (const m of best.melds) expect(analyzeMeld(m).ok).toBe(true);
  });
});

describe('žolíky — viewFor', () => {
  it('hides the other hands and the stock', () => {
    const s = game();
    const v = viewFor(s, { role: 'contestant', contestantId: 'b' });
    expect(v.hand).toEqual(s.hands.b);
    expect(v.players.find((p) => p.id === 'a')?.cards).toBe(15);
    const json = JSON.stringify(v);
    for (const c of [...s.hands.a, ...s.hands.c, ...s.stock]) expect(json).not.toContain(`"${c}"`);
    expect(viewFor(s, { role: 'spectator' }).hand).toBeNull();
  });
});
