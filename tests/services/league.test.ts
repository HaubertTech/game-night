import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Household } from '#lib/server/repo/households.ts';
import { getMatch } from '#lib/server/repo/matches.ts';
import { createPlayer, type Player } from '#lib/server/repo/players.ts';
import { applyCardAction, createCardMatch } from '#lib/server/services/cards.ts';
import { createNight, nightDetail, setNightStatus } from '#lib/server/services/nights.ts';
import { recordTabletQuiz } from '#lib/server/services/quiz.ts';
import { ResultError } from '#lib/server/services/results.ts';
import { createSeason, overallStandings, seasonDetail } from '#lib/server/services/seasons.ts';
import { householdRecordsView, playerProfile, ratingLeaderboards } from '#lib/server/services/stats.ts';
import { cleanup, makeHousehold } from '../server/helpers.ts';

let home: Household;
let a: Player;
let b: Player;
let c: Player;

beforeAll(async () => {
  home = await makeHousehold('league');
  a = await createPlayer(home.id, { name: 'Alena', level: 'hospoda', legacy_id: 'p-alena' });
  b = await createPlayer(home.id, { name: 'Bedřich', level: 'lavice' });
  c = await createPlayer(home.id, { name: 'Cyril', level: 'piskoviste' });
});
afterAll(() => cleanup([home]));

async function playPrsi(nightId: number, orders: string[][]) {
  const m = await createCardMatch(home.id, { gameType: 'prsi', nightId, playerIds: [a.id, b.id, c.id] });
  for (const order of orders) await applyCardAction(home.id, m.id, { type: 'record', order });
  return applyCardAction(home.id, m.id, { type: 'finish' });
}

describe('seasons and nights', () => {
  it('rejects overlapping seasons and invalid periods', async () => {
    await createSeason(home.id, { name: 'Podzim', starts_on: '2026-09-01', ends_on: '2026-12-31', points_table: [12, 8, 5] });
    await expect(createSeason(home.id, { name: 'Zima', starts_on: '2026-12-01', ends_on: '2027-02-28' })).rejects.toMatchObject({ status: 409 });
    await expect(createSeason(home.id, { name: 'X', starts_on: '2027-05-01', ends_on: '2027-04-01' })).rejects.toBeInstanceOf(ResultError);
  });

  it('a night picks the season of its date and builds its table and best player', async () => {
    const night = await createNight(home.id, { played_on: '2026-10-25', title: 'Sobota' });
    expect(night.season_name).toBe('Podzim');
    const ids = [a, b, c].map((p) => String(p.id));
    // Alena wins both prší games, Cyril is last.
    await playPrsi(night.id, [ids, ids]);
    await playPrsi(night.id, [[ids[0], ids[2], ids[1]]]);

    const z = await createCardMatch(home.id, { gameType: 'zoliky', nightId: night.id, playerIds: [a.id, b.id, c.id], settings: { limit: 100 } });
    let view = await applyCardAction(home.id, z.id, { type: 'addRound', winnerId: String(b.id), hand: { [a.id]: 30, [c.id]: 10 } });
    view = await applyCardAction(home.id, z.id, { type: 'addRound', winnerId: String(b.id), hand: { [a.id]: 40, [c.id]: 5 }, fromHand: true });
    expect(view.state.error).toBeNull();
    // Alena: 30 + 80 = 110 > limit → game over by rule, further rounds are refused.
    view = await applyCardAction(home.id, z.id, { type: 'addRound', winnerId: String(a.id), hand: { [b.id]: 1, [c.id]: 1 } });
    expect(view.state.error).toMatch(/ukončená/);
    view = await applyCardAction(home.id, z.id, { type: 'finish' });
    expect(view.status).toBe('finished');
    await expect(applyCardAction(home.id, z.id, { type: 'undo' })).rejects.toMatchObject({ status: 409 });

    const detail = (await nightDetail(home.id, night.id))!;
    expect(detail.matches).toHaveLength(3);
    // Season table [12, 8, 5]: Alena 12 + 12 + 5 = 29, Bedřich 5 + 8 + 12 = 25, Cyril 8 + 5 + 8 = 21.
    expect(detail.standings.map((r) => [r.playerId, r.points])).toEqual([
      [String(a.id), 29],
      [String(b.id), 25],
      [String(c.id), 21],
    ]);
    expect(detail.best.map((r) => r.playerId)).toEqual([String(a.id)]);

    const season = (await seasonDetail(home.id, night.season_id!))!;
    expect(season.standings[0]).toMatchObject({ playerId: String(a.id), points: 29, wins: 2 });
    expect(season.byGameType.zoliky[0].playerId).toBe(String(b.id));
    expect(season.byGameType.quiz).toEqual([]);
    expect((await overallStandings(home.id)).matches).toBe(3);
  });

  it('refuses card matches in a closed night', async () => {
    const night = await createNight(home.id, { played_on: '2026-10-26' });
    await setNightStatus(home.id, night.id, 'closed');
    await expect(createCardMatch(home.id, { gameType: 'prsi', nightId: night.id, playerIds: [a.id, b.id] })).rejects.toMatchObject({ status: 409 });
  });

  it('corrects the last prší deal', async () => {
    const m = await createCardMatch(home.id, { gameType: 'prsi', playerIds: [a.id, b.id] });
    await applyCardAction(home.id, m.id, { type: 'record', order: [String(a.id), String(b.id)] });
    const fixed = await applyCardAction(home.id, m.id, { type: 'replaceLast', order: [String(b.id), String(a.id)] });
    expect((fixed.state as { deals: unknown[] }).deals).toHaveLength(1);
    expect((fixed.state as { deals: { order: string[] }[] }).deals[0].order[0]).toBe(String(b.id));
    expect((await getMatch(home.id, m.id))!.status).toBe('running');
  });
});

describe('tablet quiz', () => {
  const game = {
    id: 'g-tablet-1',
    playedAt: '2026-10-25T17:00:00.000Z',
    contestants: [
      { id: 'p-alena', name: 'Alena', avatar: '🦊', level: 'hospoda', memberIds: ['p-alena'] },
      { id: 'p-new', name: 'Dana', avatar: '🐸', level: 'lavice', memberIds: ['p-new'] },
    ],
    ranking: [
      { contestantId: 'p-alena', score: 9, place: 1 },
      { contestantId: 'p-new', score: 4, place: 2 },
    ],
    answers: [
      { round: 0, contestantId: 'p-alena', questionId: 'hospoda-priroda-001', correct: true, points: 3 },
      { round: 0, contestantId: 'p-alena', questionId: 'hospoda-priroda-002', correct: true, points: 3 },
      { round: 0, contestantId: 'p-alena', questionId: 'hospoda-priroda-003', correct: false, points: 0 },
      { round: 0, contestantId: 'p-new', questionId: 'lavice-priroda-001', correct: true, points: 3 },
    ],
  };

  it('reports profiles without a server counterpart, then creates them on request', async () => {
    const first = await recordTabletQuiz(home.id, { game });
    expect(first).toMatchObject({ status: 'missing', missing: [{ id: 'p-new', name: 'Dana' }] });
    const second = await recordTabletQuiz(home.id, { game, createMissing: true });
    expect(second.status).toBe('recorded');
    const again = await recordTabletQuiz(home.id, { game, createMissing: true });
    expect(again.status).toBe('already');
  });

  it('feeds the player profile, leaderboards and records', async () => {
    const profile = (await playerProfile(home.id, a.id))!;
    expect(profile.answers.total).toBe(3);
    expect(profile.answers.byTheme.priroda).toMatchObject({ correct: 2, total: 3 });
    expect(profile.answers.bestTheme).toBe('priroda');
    expect(profile.ratings.find((r) => r.game_type === 'quiz')!.games).toBe(1);
    expect(profile.ratings.find((r) => r.game_type === 'prsi')!.games).toBe(2);
    expect(profile.history.length).toBeGreaterThanOrEqual(4);
    expect(profile.headToHead.find((h) => h.opponentId === String(c.id))!.wins).toBeGreaterThan(0);
    const boards = await ratingLeaderboards(home.id);
    expect(boards.prsi[0].player_id).toBe(a.id);
    const records = await householdRecordsView(home.id);
    expect(records.bestQuizScore?.score).toBe(9);
  });
});
