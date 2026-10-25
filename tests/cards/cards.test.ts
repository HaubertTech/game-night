import { describe, expect, it } from 'vitest';
import {
  createPrsi,
  prsiSummary,
  prsiToMatchResult,
  prsiWinners,
  reducePrsi,
  validateOrder,
  type PrsiAction,
  type PrsiState,
} from '../../src/lib/cards/prsi.ts';
import {
  activePlayers,
  createZoliky,
  isFinished,
  reduceZoliky,
  zolikyRanking,
  zolikySheet,
  zolikyToMatchResult,
  type ZolikyAction,
  type ZolikySettings,
  type ZolikyState,
} from '../../src/lib/cards/zoliky.ts';
import { seasonStandings } from '../../src/lib/league/index.ts';

const players = [
  { id: 'tata', name: 'Táta' },
  { id: 'mama', name: 'Máma' },
  { id: 'kuba', name: 'Kuba' },
];
const meta = { id: 'g1', createdAt: '2026-11-01T18:00:00Z', nightId: 'n1', players };

function playPrsi(actions: PrsiAction[]): PrsiState {
  return actions.reduce(reducePrsi, createPrsi(meta));
}

describe('prší', () => {
  it('validates that every player is in the order exactly once', () => {
    expect(validateOrder(players, ['tata', 'mama', 'kuba'])).toEqual([]);
    expect(validateOrder(players, ['tata', 'tata', 'kuba'])).toHaveLength(2); // duplicate + missing
    expect(validateOrder(players, ['tata', 'mama', 'kuba', 'x'])).toEqual(['Neznámý hráč: x']);
  });

  it('rejects an invalid deal and keeps the state', () => {
    const s = playPrsi([{ type: 'record', order: ['tata', 'mama'] }]);
    expect(s.deals).toEqual([]);
    expect(s.error).toContain('Kuba');
  });

  it('sums places over deals and picks the winner', () => {
    const s = playPrsi([
      { type: 'record', order: ['tata', 'mama', 'kuba'] },
      { type: 'record', order: ['mama', 'tata', 'kuba'] },
      { type: 'record', order: ['tata', 'kuba', 'mama'] },
    ]);
    expect(prsiSummary(s).map((r) => [r.playerId, r.placeSum, r.wins, r.losses, r.place])).toEqual([
      ['tata', 4, 2, 0, 1],
      ['mama', 6, 1, 1, 2],
      ['kuba', 8, 0, 2, 3],
    ]);
    expect(prsiWinners(s)).toEqual(['tata']);
  });

  it('shares the place on equal sum and wins', () => {
    const s = playPrsi([
      { type: 'record', order: ['tata', 'mama', 'kuba'] },
      { type: 'record', order: ['mama', 'tata', 'kuba'] },
    ]);
    expect(prsiWinners(s)).toEqual(['tata', 'mama']);
  });

  it('undoes and corrects the last deal', () => {
    let s = playPrsi([
      { type: 'record', order: ['tata', 'mama', 'kuba'] },
      { type: 'record', order: ['kuba', 'mama', 'tata'] },
    ]);
    s = reducePrsi(s, { type: 'replaceLast', order: ['mama', 'kuba', 'tata'] });
    expect(s.deals.at(-1)!.order).toEqual(['mama', 'kuba', 'tata']);
    s = reducePrsi(s, { type: 'undo' });
    expect(s.deals).toHaveLength(1);
    expect(reducePrsi(createPrsi(meta), { type: 'undo' }).error).toBeTruthy();
  });

  it('blocks recording after finish and converts to a league result', () => {
    let s = playPrsi([{ type: 'record', order: ['kuba', 'tata', 'mama'] }, { type: 'finish' }]);
    expect(reducePrsi(s, { type: 'record', order: ['tata', 'mama', 'kuba'] }).deals).toHaveLength(1);
    const m = prsiToMatchResult(s, '2026-11-01T19:00:00Z');
    expect(m).toMatchObject({ matchId: 'g1', gameType: 'prsi', nightId: 'n1', playedAt: '2026-11-01T19:00:00Z' });
    expect(m.participants[0]).toEqual({ participantId: 'kuba', kind: 'player', memberIds: ['kuba'], place: 1, score: 1 });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    s = reducePrsi(s, { type: 'reopen' });
    expect(s.finished).toBe(false);
  });
});

function playZoliky(actions: ZolikyAction[], settings: Partial<ZolikySettings> = {}): ZolikyState {
  return actions.reduce(reduceZoliky, createZoliky({ ...meta, settings }));
}

describe('žolíky', () => {
  it('keeps running totals; the winner of a round scores 0 by default', () => {
    const s = playZoliky([
      { type: 'addRound', winnerId: 'tata', hand: { mama: 20, kuba: 35 } },
      { type: 'addRound', winnerId: 'kuba', hand: { tata: 12, mama: 5 } },
    ]);
    const sheet = zolikySheet(s);
    expect(sheet.rows[0].totals).toEqual({ tata: 0, mama: 20, kuba: 35 });
    expect(sheet.totals).toEqual({ tata: 12, mama: 25, kuba: 35 });
    expect(sheet.finished).toBe(false);
    expect(zolikyRanking(s).map((r) => [r.playerId, r.place, r.wins])).toEqual([
      ['tata', 1, 1],
      ['mama', 2, 0],
      ['kuba', 3, 1],
    ]);
  });

  it('applies a negative winner premium and closing from hand', () => {
    const s = playZoliky(
      [{ type: 'addRound', winnerId: 'tata', hand: { mama: 20, kuba: 10 }, fromHand: true }],
      { winnerScore: -10, closeFromHand: { winnerBonus: -20, othersMultiplier: 2 } },
    );
    expect(zolikySheet(s).totals).toEqual({ tata: -30, mama: 40, kuba: 20 });
  });

  it('validates the round input', () => {
    let s = playZoliky([{ type: 'addRound', winnerId: 'tata', hand: { mama: 20 } }]);
    expect(s.rounds).toHaveLength(0);
    expect(s.error).toContain('Kuba');
    s = reduceZoliky(s, { type: 'addRound', winnerId: 'nikdo', hand: { tata: 1, mama: 1, kuba: 1 } });
    expect(s.error).toBeTruthy();
    s = reduceZoliky(s, { type: 'addRound', winnerId: 'tata', hand: { mama: -5, kuba: 1 } });
    expect(s.error).toContain('záporné');
  });

  it('ends the game when someone goes over the limit', () => {
    const s = playZoliky(
      [
        { type: 'addRound', winnerId: 'tata', hand: { mama: 60, kuba: 30 } },
        { type: 'addRound', winnerId: 'kuba', hand: { tata: 10, mama: 50 } },
      ],
      { limit: 100 },
    );
    expect(isFinished(s)).toBe(true);
    expect(reduceZoliky(s, { type: 'addRound', winnerId: 'tata', hand: { mama: 1, kuba: 1 } }).error).toBe('Hra je ukončená.');
    expect(zolikyRanking(s).map((r) => r.playerId)).toEqual(['tata', 'kuba', 'mama']);
  });

  it('eliminates players over the limit until one is left', () => {
    let s = playZoliky(
      [
        { type: 'addRound', winnerId: 'tata', hand: { mama: 120, kuba: 30 } },
        { type: 'addRound', winnerId: 'tata', hand: { kuba: 20 } },
      ],
      { limit: 100, limitMode: 'eliminate' },
    );
    expect(activePlayers(s).map((p) => p.id)).toEqual(['tata', 'kuba']);
    expect(isFinished(s)).toBe(false);
    s = reduceZoliky(s, { type: 'addRound', winnerId: 'tata', hand: { kuba: 60 } });
    expect(isFinished(s)).toBe(true);
    expect(zolikyRanking(s).map((r) => [r.playerId, r.eliminated, r.place])).toEqual([
      ['tata', false, 1],
      ['kuba', true, 2],
      ['mama', true, 3],
    ]);
  });

  it('supports higher-is-better and a fixed number of rounds', () => {
    const s = playZoliky(
      [
        { type: 'addRound', winnerId: 'mama', hand: { tata: 30, kuba: 10 } },
        { type: 'addRound', winnerId: 'mama', hand: { tata: 5, kuba: 50 } },
      ],
      { lowerIsBetter: false, maxRounds: 2, winnerScore: 25 },
    );
    expect(isFinished(s)).toBe(true);
    expect(zolikyRanking(s).map((r) => [r.playerId, r.total])).toEqual([
      ['kuba', 60],
      ['mama', 50],
      ['tata', 35],
    ]);
  });

  it('undoes the last round, also after the game ended by limit', () => {
    let s = playZoliky(
      [
        { type: 'addRound', winnerId: 'tata', hand: { mama: 10, kuba: 10 } },
        { type: 'addRound', winnerId: 'tata', hand: { mama: 200, kuba: 10 } },
      ],
      { limit: 100 },
    );
    expect(isFinished(s)).toBe(true);
    s = reduceZoliky(s, { type: 'undo' });
    expect(isFinished(s)).toBe(false);
    expect(zolikySheet(s).totals).toEqual({ tata: 0, mama: 10, kuba: 10 });
  });

  it('converts to a league result usable by the season table', () => {
    let s = playZoliky([{ type: 'addRound', winnerId: 'kuba', hand: { tata: 10, mama: 10 } }]);
    s = reduceZoliky(s, { type: 'finish' });
    expect(isFinished(s)).toBe(true);
    const m = zolikyToMatchResult(s);
    expect(m.gameType).toBe('zoliky');
    expect(m.participants.map((p) => [p.participantId, p.place, p.score])).toEqual([
      ['kuba', 1, 0],
      ['tata', 2, 10],
      ['mama', 2, 10],
    ]);
    expect(seasonStandings([m]).map((r) => [r.playerId, r.points])).toEqual([
      ['kuba', 10],
      ['mama', 6],
      ['tata', 6],
    ]);
  });
});
