import { describe, expect, it } from 'vitest';
import { autoplayPrsi, autoplayZoliky, prsiAiStep, zolikyAiStep } from '../../../src/lib/games/karty-hra/ai/autoplay.ts';
import { choosePrsiMove } from '../../../src/lib/games/karty-hra/ai/prsi-ai.ts';
import { chooseZolikyCommand } from '../../../src/lib/games/karty-hra/ai/zoliky-ai.ts';
import { applyPrsi, createPrsiGame, playableCards, type AiLevel, type PrsiGameState } from '../../../src/lib/games/karty-hra/prsi-engine.ts';
import { applyZoliky, createZolikyGame, type ZolikyGameState } from '../../../src/lib/games/karty-hra/zoliky-engine.ts';
import { analyzeMeld } from '../../../src/lib/games/karty-hra/zoliky-melds.ts';

function seats(n: number, levels: AiLevel[]) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Hráč ${i + 1}`, ai: levels[i % levels.length] }));
}

function prsiCards(s: PrsiGameState): number {
  return Object.values(s.hands).flat().length + s.stock.length + s.discard.length;
}

function zolikyCards(s: ZolikyGameState): number {
  return Object.values(s.hands).flat().length + s.stock.length + s.discard.length + s.melds.reduce((n, m) => n + m.slots.length, 0);
}

describe('počítač — prší', () => {
  it('plays 100 seeded games (2–5 players, all levels) to the end with legal moves only', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const n = 2 + (seed % 4);
      let s = createPrsiGame({ id: `p${seed}`, createdAt: '2026-10-25T10:00:00.000Z', seed, players: seats(n, [1, 2, 3]), settings: { deals: 2 } });
      for (let step = 0; step < 5000 && s.phase !== 'finished'; step++) {
        if (s.phase === 'dealEnd') {
          const r = applyPrsi(s, { type: 'nextDeal', by: { role: 'host' }, now: step });
          if (!r.ok) throw new Error(r.error);
          s = r.state;
          continue;
        }
        s = prsiAiStep(s, step); // throws when the engine refuses the AI move
        expect(prsiCards(s)).toBe(32);
      }
      expect(s.phase).toBe('finished');
      expect(s.sheet.deals).toHaveLength(2);
    }
  });

  it('is deterministic for the same seed', () => {
    const make = () => createPrsiGame({ id: 'x', createdAt: '2026-10-25T10:00:00.000Z', seed: 99, players: seats(3, [2, 3, 1]), settings: { deals: 3 } });
    expect(autoplayPrsi(make()).sheet.deals).toEqual(autoplayPrsi(make()).sheet.deals);
  });

  it('the advice always names a playable card or the right fallback', () => {
    const s = createPrsiGame({ id: 'x', createdAt: '2026-10-25T10:00:00.000Z', seed: 5, players: seats(2, [3]) });
    const advice = choosePrsiMove(s, s.turn, 3);
    if (advice.move.type === 'play') expect(playableCards(s, s.turn)).toContain(advice.move.cardId);
    expect(advice.reason.length).toBeGreaterThan(5);
  });

  it('answers a seven with a seven', () => {
    const base = createPrsiGame({ id: 'x', createdAt: '2026-10-25T10:00:00.000Z', seed: 5, players: seats(2, [2]) });
    const s: PrsiGameState = { ...base, hands: { p0: ['kule-7', 'kule-8', 'srdce-svrsek'], p1: ['listy-9'] }, discard: ['srdce-7'], suit: 'srdce', pendingSevens: 1, pendingAce: false, turn: 'p0' };
    for (const level of [2, 3] as AiLevel[]) expect(choosePrsiMove(s, 'p0', level).move).toEqual({ type: 'play', cardId: 'kule-7' });
  });

  it('a medium player saves the svršek when another card fits', () => {
    const base = createPrsiGame({ id: 'x', createdAt: '2026-10-25T10:00:00.000Z', seed: 5, players: seats(2, [2]) });
    const s: PrsiGameState = { ...base, hands: { p0: ['srdce-8', 'kule-svrsek', 'listy-10'], p1: ['listy-9', 'kule-8', 'zaludy-9'] }, discard: ['srdce-9'], suit: 'srdce', pendingSevens: 0, pendingAce: false, turn: 'p0' };
    expect(choosePrsiMove(s, 'p0', 2).move).toEqual({ type: 'play', cardId: 'srdce-8' });
  });
});

describe('počítač — žolíky', () => {
  it('plays 100 seeded games to the end with legal moves only; every combination on the table is valid', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const n = 2 + (seed % 3);
      let s = createZolikyGame({ id: `z${seed}`, createdAt: '2026-10-25T10:00:00.000Z', seed, players: seats(n, [3, 2, 1]), settings: { rounds: 2 } });
      for (let step = 0; step < 20000 && s.phase !== 'finished'; step++) {
        if (s.phase === 'roundEnd') {
          const r = applyZoliky(s, { type: 'nextRound', by: { role: 'host' }, now: step });
          if (!r.ok) throw new Error(r.error);
          s = r.state;
          continue;
        }
        s = zolikyAiStep(s, step);
        expect(zolikyCards(s)).toBe(108);
      }
      expect(s.phase).toBe('finished');
      for (const m of s.melds) expect(analyzeMeld(m.slots.map((x) => x.id)).ok).toBe(true);
      expect(s.sheet.rounds).toHaveLength(2);
    }
  });

  it('is deterministic for the same seed', () => {
    const make = () => createZolikyGame({ id: 'x', createdAt: '2026-10-25T10:00:00.000Z', seed: 11, players: seats(3, [1, 2, 3]), settings: { rounds: 3 } });
    expect(autoplayZoliky(make()).sheet.rounds).toEqual(autoplayZoliky(make()).sheet.rounds);
  });

  it('a stronger player loses fewer points than the beginner', () => {
    let strong = 0;
    let weak = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = autoplayZoliky(
        createZolikyGame({ id: 'x', createdAt: '2026-10-25T10:00:00.000Z', seed, players: [{ id: 's', name: 'S', ai: 3 }, { id: 'w', name: 'W', ai: 1 }], settings: { rounds: 1 } }),
      );
      strong += s.sheet.rounds[0].hand.s ?? 0;
      weak += s.sheet.rounds[0].hand.w ?? 0;
    }
    expect(strong).toBeLessThan(weak);
  });

  it('the advice comes with a sentence', () => {
    const s = createZolikyGame({ id: 'x', createdAt: '2026-10-25T10:00:00.000Z', seed: 2, players: seats(2, [3]) });
    const advice = chooseZolikyCommand(s, s.turn, 3);
    expect(advice.reason).toMatch(/\S/);
    expect(applyZoliky(s, { ...advice.command, by: { role: 'contestant', contestantId: s.turn }, now: 1 }).ok).toBe(true);
  });
});
