import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '#lib/server/db.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { createMatch, getMatch, listParticipants } from '#lib/server/repo/matches.ts';
import { createPlayer, type Player } from '#lib/server/repo/players.ts';
import { getRatings } from '#lib/server/repo/ratings.ts';
import { loadSeen } from '#lib/server/repo/seen.ts';
import { createTeam } from '#lib/server/repo/teams.ts';
import { recordMatch, ResultError } from '#lib/server/services/results.ts';
import { cleanup, makeHousehold } from '../server/helpers.ts';

let home: Household;
let other: Household;
let a: Player;
let b: Player;
let c: Player;

beforeAll(async () => {
  home = await makeHousehold('results');
  other = await makeHousehold('results-other');
  a = await createPlayer(home.id, { name: 'Alena', level: 'hospoda' });
  b = await createPlayer(home.id, { name: 'Bedřich', level: 'lavice' });
  c = await createPlayer(home.id, { name: 'Cyril', level: 'piskoviste' });
});
afterAll(() => cleanup([home, other]));

const seat = (p: Player, place: number, score = 0) => ({
  participantId: `p${p.id}`,
  kind: 'player' as const,
  playerId: p.id,
  memberIds: [p.id],
  place,
  score,
});

describe('recordMatch', () => {
  it('writes league points, answers, seen questions and ratings', async () => {
    const m = await createMatch(home.id, { game_type: 'quiz', mode: 'pass', status: 'running' });
    await recordMatch(home.id, {
      matchId: m.id,
      gameType: 'quiz',
      playedAt: '2026-10-25T18:00:00Z',
      participants: [seat(a, 1, 12), seat(b, 2, 8), seat(c, 3, 3)],
      answers: [
        { participantId: `p${a.id}`, questionId: 'hospoda-priroda-001', theme: 'priroda', level: 'hospoda', roundNo: 1, correct: true, points: 3 },
        { participantId: `p${b.id}`, questionId: 'lavice-dejiny-002', theme: 'dejiny', level: 'lavice', roundNo: 1, correct: false, points: 0 },
      ],
    });
    expect((await getMatch(home.id, m.id))!.status).toBe('finished');
    const parts = await listParticipants(m.id);
    expect(parts.map((p) => [p.player_id, p.place, p.league_points])).toEqual([
      [a.id, 1, 10],
      [b.id, 2, 7],
      [c.id, 3, 5],
    ]);
    const answers = await query('SELECT question_id, correct FROM quiz_answers WHERE match_id = $1 ORDER BY id', [m.id]);
    expect(answers).toHaveLength(2);
    const seen = await loadSeen([a.id, b.id, c.id]);
    expect(seen[String(a.id)]).toContain('hospoda-priroda-001');
    expect(seen[String(b.id)]).toContain('lavice-dejiny-002');
    const ratings = await getRatings([a.id, b.id, c.id], 'quiz');
    expect(ratings).toHaveLength(3);
    const byId = new Map(ratings.map((r) => [r.player_id, r]));
    expect(byId.get(a.id)!.mu).toBeGreaterThan(byId.get(c.id)!.mu);
    expect(byId.get(a.id)!.games).toBe(1);
  });

  it('is idempotent: the second call changes nothing and does not throw', async () => {
    const m = await createMatch(home.id, { game_type: 'prsi', status: 'running' });
    const input = { matchId: m.id, gameType: 'prsi' as const, playedAt: '2026-10-25T19:00:00Z', participants: [seat(a, 2, 5), seat(b, 1, 3)] };
    expect(await recordMatch(home.id, input)).toEqual({ recorded: true });
    const before = await getRatings([a.id, b.id], 'prsi');
    expect(await recordMatch(home.id, input)).toEqual({ recorded: false });
    expect(await getRatings([a.id, b.id], 'prsi')).toEqual(before);
    expect(await listParticipants(m.id)).toHaveLength(2);
    expect(before.find((r) => r.player_id === a.id)!.games).toBe(1);
  });

  it('uses the points table of the evening season', async () => {
    const season = (await query<{ id: number }>(
      `INSERT INTO seasons (household_id, name, starts_on, ends_on, points_table) VALUES ($1, 'S', '2026-10-01', '2026-12-31', '[20, 10]') RETURNING id`,
      [home.id],
    ))[0];
    const night = (await query<{ id: number }>('INSERT INTO game_nights (household_id, season_id) VALUES ($1, $2) RETURNING id', [home.id, season.id]))[0];
    const m = await createMatch(home.id, { game_type: 'zoliky', night_id: night.id, status: 'running' });
    await recordMatch(home.id, {
      matchId: m.id,
      gameType: 'zoliky',
      playedAt: '2026-10-25T20:00:00Z',
      participants: [seat(a, 1, 10), seat(b, 2, 40), seat(c, 3, 90)],
      cardRounds: [
        { roundNo: 1, playerId: a.id, points: 0 },
        { roundNo: 1, playerId: b.id, points: 40 },
      ],
    });
    const parts = await listParticipants(m.id);
    expect(parts.map((p) => p.league_points)).toEqual([20, 10, 1]);
    expect(await query('SELECT * FROM card_rounds WHERE match_id = $1', [m.id])).toHaveLength(2);
  });

  it('rates every member of a team seat and marks seen for all of them', async () => {
    const team = await createTeam(home.id, { name: 'Děti', member_ids: [b.id, c.id] });
    const m = await createMatch(home.id, { game_type: 'quiz', status: 'running' });
    await recordMatch(home.id, {
      matchId: m.id,
      gameType: 'quiz',
      playedAt: '2026-10-25T21:00:00Z',
      participants: [
        { participantId: 'team', kind: 'team', teamId: team.id, memberIds: [b.id, c.id], place: 1, score: 9 },
        seat(a, 2, 4),
      ],
      answers: [{ participantId: 'team', teamId: team.id, questionId: 'lavice-jidlo-009', theme: 'jidlo', level: 'lavice', roundNo: 1, correct: true, points: 3 }],
    });
    const seen = await loadSeen([b.id, c.id]);
    expect(seen[String(b.id)]).toContain('lavice-jidlo-009');
    expect(seen[String(c.id)]).toContain('lavice-jidlo-009');
    const ratings = await getRatings([b.id, c.id], 'quiz');
    expect(ratings.every((r) => r.games === 2)).toBe(true);
  });

  it('rejects players of another household and leaves the match open', async () => {
    const stranger = await createPlayer(other.id, { name: 'Cizí', level: 'hospoda' });
    const m = await createMatch(home.id, { game_type: 'prsi', status: 'running' });
    await expect(
      recordMatch(home.id, { matchId: m.id, gameType: 'prsi', playedAt: '2026-10-25T19:00:00Z', participants: [seat(a, 1), seat(stranger, 2)] }),
    ).rejects.toBeInstanceOf(ResultError);
    expect((await getMatch(home.id, m.id))!.status).toBe('running');
  });

  it('rejects a match of another household', async () => {
    const m = await createMatch(other.id, { game_type: 'prsi', status: 'running' });
    await expect(
      recordMatch(home.id, { matchId: m.id, gameType: 'prsi', playedAt: '2026-10-25T19:00:00Z', participants: [seat(a, 1), seat(b, 2)] }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
