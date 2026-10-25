import { describe, expect, it } from 'vitest';
import { mariasDeck, type MariasCardId, type MariasSuit } from '../../../src/lib/games/karty-hra/cards.ts';
import {
  applyPrsi,
  createPrsiGame,
  explainCard,
  playableCards,
  toMatchResult,
  viewFor,
  type PrsiCommand,
  type PrsiGameState,
  type PrsiResult,
} from '../../../src/lib/games/karty-hra/prsi-engine.ts';

const PLAYERS = [
  { id: 'a', name: 'Anna' },
  { id: 'b', name: 'Bára' },
  { id: 'c', name: 'Cyril' },
];

function game(seed = 7, players = PLAYERS, settings = {}) {
  return createPrsiGame({ id: 'g1', createdAt: '2026-10-25T10:00:00.000Z', seed, players, settings });
}

/** A fixed table: given hands, top card and suit; the rest of the deck is the stock. */
function table(
  hands: Record<string, MariasCardId[]>,
  top: MariasCardId,
  extra: Partial<PrsiGameState> = {},
  players = PLAYERS.filter((p) => p.id in hands),
): PrsiGameState {
  const base = game(7, players);
  const used = new Set([...Object.values(hands).flat(), top]);
  const stock = mariasDeck().filter((c) => !used.has(c));
  const suit = top.split('-')[0] as MariasSuit;
  return { ...base, hands, discard: [top], stock, suit, pendingSevens: 0, pendingAce: false, turn: players[0].id, out: [], ...extra };
}

function act(state: PrsiGameState, by: string, command: PrsiCommand): PrsiResult {
  return applyPrsi(state, { ...command, by: { role: 'contestant', contestantId: by }, now: 1 });
}

function ok(result: PrsiResult): PrsiGameState {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.state;
}

describe('prší — rozdání', () => {
  it('deals 4 cards to everyone and turns one card up, 32 cards in total', () => {
    const s = game();
    for (const p of PLAYERS) expect(s.hands[p.id]).toHaveLength(4);
    const all = [...Object.values(s.hands).flat(), ...s.stock, ...s.discard];
    expect(all).toHaveLength(32);
    expect(new Set(all).size).toBe(32);
  });

  it('the same seed deals the same cards', () => {
    expect(game(42).hands).toEqual(game(42).hands);
    expect(game(42).hands).not.toEqual(game(43).hands);
  });

  it('refuses fewer than 2 or more than 5 players', () => {
    expect(() => game(1, [PLAYERS[0]])).toThrow();
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(() => game(1, six)).toThrow();
  });
});

describe('prší — přiznat barvu nebo hodnotu', () => {
  const s = table({ a: ['srdce-8', 'listy-9', 'kule-kral', 'zaludy-10'], b: ['kule-7'] }, 'srdce-9');

  it('allows the same suit or the same rank', () => {
    expect(playableCards(s, 'a').sort()).toEqual(['listy-9', 'srdce-8'].sort());
  });

  it('refuses a card of another suit and rank and explains why', () => {
    const r = act(s, 'a', { type: 'play', cardId: 'kule-kral' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('wrongCard');
    expect(explainCard(s, 'a', 'kule-kral')).toMatch(/barvu ani hodnotu/);
  });

  it('refuses a move out of turn', () => {
    const r = act(s, 'b', { type: 'play', cardId: 'kule-7' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('notYourTurn');
  });

  it('a player who cannot play draws one card and the turn passes', () => {
    const t = table({ a: ['kule-kral'], b: ['kule-7'] }, 'srdce-9');
    const next = ok(act(t, 'a', { type: 'draw' }));
    expect(next.hands.a).toHaveLength(2);
    expect(next.turn).toBe('b');
  });
});

describe('prší — sedma', () => {
  it('the next player draws two cards', () => {
    const s = table({ a: ['srdce-7', 'kule-8'], b: ['listy-8', 'zaludy-9'] }, 'srdce-9');
    const after = ok(act(s, 'a', { type: 'play', cardId: 'srdce-7' }));
    expect(after.pendingSevens).toBe(1);
    expect(playableCards(after, 'b')).toEqual([]);
    expect(act(after, 'b', { type: 'play', cardId: 'listy-8' }).ok).toBe(false);
    const drawn = ok(act(after, 'b', { type: 'draw' }));
    expect(drawn.hands.b).toHaveLength(4);
    expect(drawn.pendingSevens).toBe(0);
    expect(drawn.turn).toBe('a');
  });

  it('sevens add up: a seven on a seven means four cards, three sevens six', () => {
    const s = table(
      { a: ['srdce-7', 'kule-8'], b: ['listy-7', 'zaludy-9'], c: ['zaludy-7', 'kule-9', 'kule-10'] },
      'srdce-9',
    );
    let t = ok(act(s, 'a', { type: 'play', cardId: 'srdce-7' }));
    t = ok(act(t, 'b', { type: 'play', cardId: 'listy-7' }));
    expect(t.pendingSevens).toBe(2);
    t = ok(act(t, 'c', { type: 'play', cardId: 'zaludy-7' }));
    expect(t.pendingSevens).toBe(3);
    const before = t.hands.a.length;
    t = ok(act(t, 'a', { type: 'draw' }));
    expect(t.hands.a.length - before).toBe(6);
  });

  it('a svršek may not be played on an active seven', () => {
    const s = table({ a: ['srdce-7', 'zaludy-kral'], b: ['listy-svrsek', 'kule-8'] }, 'srdce-9');
    const t = ok(act(s, 'a', { type: 'play', cardId: 'srdce-7' }));
    const r = act(t, 'b', { type: 'play', cardId: 'listy-svrsek', suit: 'kule' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('mustAnswerSeven');
  });
});

describe('prší — eso', () => {
  it('the next player stands unless they answer with an ace', () => {
    const s = table({ a: ['srdce-eso', 'kule-8'], b: ['listy-9', 'srdce-8'], c: ['zaludy-9', 'srdce-10'] }, 'srdce-9');
    const t = ok(act(s, 'a', { type: 'play', cardId: 'srdce-eso' }));
    expect(t.pendingAce).toBe(true);
    expect(act(t, 'b', { type: 'play', cardId: 'srdce-8' }).ok).toBe(false);
    expect(act(t, 'b', { type: 'draw' }).ok).toBe(false);
    const stood = ok(act(t, 'b', { type: 'stand' }));
    expect(stood.pendingAce).toBe(false);
    expect(stood.turn).toBe('c');
    expect(stood.hands.b).toHaveLength(2);
    // After the stand the ace is an ordinary hearts card.
    expect(playableCards(stood, 'c')).toEqual(['srdce-10']);
  });

  it('an ace on an ace passes the stand on', () => {
    const s = table({ a: ['srdce-eso', 'kule-8'], b: ['listy-eso', 'srdce-8'], c: ['zaludy-9'] }, 'srdce-9');
    let t = ok(act(s, 'a', { type: 'play', cardId: 'srdce-eso' }));
    t = ok(act(t, 'b', { type: 'play', cardId: 'listy-eso' }));
    expect(t.pendingAce).toBe(true);
    expect(t.turn).toBe('c');
    t = ok(act(t, 'c', { type: 'stand' }));
    expect(t.turn).toBe('a');
  });
});

describe('prší — svršek', () => {
  it('may be played on any card and the player chooses the suit', () => {
    const s = table({ a: ['kule-svrsek', 'kule-8'], b: ['listy-9', 'zaludy-8'] }, 'srdce-9');
    expect(act(s, 'a', { type: 'play', cardId: 'kule-svrsek' }).ok).toBe(false);
    const t = ok(act(s, 'a', { type: 'play', cardId: 'kule-svrsek', suit: 'zaludy' }));
    expect(t.suit).toBe('zaludy');
    expect(playableCards(t, 'b')).toEqual(['zaludy-8']);
  });

  it('svršek on svršek follows the setting', () => {
    const allowed = table({ a: ['kule-svrsek', 'kule-8'], b: ['listy-9'] }, 'srdce-svrsek', { suit: 'listy' });
    expect(playableCards(allowed, 'a')).toContain('kule-svrsek');
    const forbidden = { ...allowed, settings: { ...allowed.settings, oberOnOber: false } };
    expect(playableCards(forbidden, 'a')).not.toContain('kule-svrsek');
  });

  it('a seven turned up at the start counts against the first player', () => {
    const s = table({ a: ['kule-8'], b: ['listy-9'] }, 'srdce-7', { pendingSevens: 1 });
    const t = ok(act(s, 'a', { type: 'draw' }));
    expect(t.hands.a).toHaveLength(3);
  });
});

describe('prší — konec a pořadí', () => {
  it('the first player out wins, the others play on for the order', () => {
    const s = table({ a: ['srdce-8'], b: ['srdce-10', 'kule-kral'], c: ['listy-9', 'srdce-kral', 'zaludy-8'] }, 'srdce-9');
    let t = ok(act(s, 'a', { type: 'play', cardId: 'srdce-8' }));
    expect(t.out).toEqual(['a']);
    expect(t.phase).toBe('playing');
    expect(t.turn).toBe('b');
    t = ok(act(t, 'b', { type: 'play', cardId: 'srdce-10' }));
    t = ok(act(t, 'c', { type: 'play', cardId: 'srdce-kral' }));
    // Anna is out, so after Cyril it is Bára again.
    expect(t.turn).toBe('b');
    t = ok(act(t, 'b', { type: 'play', cardId: 'kule-kral' }));
    expect(t.phase).toBe('finished');
    expect(t.sheet.deals[0].order).toEqual(['a', 'b', 'c']);
    const result = toMatchResult(t);
    expect(result.gameType).toBe('prsi');
    expect(result.participants.map((p) => [p.participantId, p.place])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('several deals: the next deal starts with fresh cards', () => {
    const s = { ...table({ a: ['srdce-8'], b: ['kule-kral'] }, 'srdce-9'), settings: { ...game().settings, deals: 2 } };
    const t = ok(act(s, 'a', { type: 'play', cardId: 'srdce-8' }));
    expect(t.phase).toBe('dealEnd');
    const n = ok(applyPrsi(t, { type: 'nextDeal', by: { role: 'host' }, now: 2 }));
    expect(n.phase).toBe('playing');
    expect(n.hands.a).toHaveLength(4);
    expect(n.dealIndex).toBe(1);
  });

  it('reshuffles the discard pile when the stock runs out', () => {
    const s = table({ a: ['kule-kral'], b: ['listy-9'] }, 'srdce-9', { stock: [], discard: ['srdce-8', 'srdce-10', 'srdce-9'] });
    const t = ok(act(s, 'a', { type: 'draw' }));
    expect(t.hands.a).toHaveLength(2);
    expect(t.discard).toEqual(['srdce-9']);
  });
});

describe('prší — viewFor', () => {
  it('shows only the own hand, others as counts', () => {
    const s = game();
    const v = viewFor(s, { role: 'contestant', contestantId: 'a' });
    expect(v.hand).toEqual(s.hands.a);
    expect(v.players.find((p) => p.id === 'b')?.cards).toBe(4);
    const json = JSON.stringify(v);
    for (const c of s.hands.b) expect(json).not.toContain(`"${c}"`);
    for (const c of s.stock) expect(json).not.toContain(`"${c}"`);
    const tv = viewFor(s, { role: 'host' });
    expect(tv.hand).toBeNull();
  });
});
