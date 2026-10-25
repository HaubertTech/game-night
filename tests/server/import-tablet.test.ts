import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '#lib/server/db.ts';
import { importTablet, leaguePoints, parseQuestionId, parseTabletExport } from '#lib/server/import-tablet.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { listPlayers } from '#lib/server/repo/players.ts';
import { listTeams } from '#lib/server/repo/teams.ts';
import { POST as importRoute } from '../../src/routes/api/import/tablet/+server.ts';
import { cleanup, fakeEvent, httpError, makeHousehold } from './helpers.ts';

// Shape of `exportData()` from src/lib/storage.ts (fake names only).
const EXPORT = {
  exportedAt: '2026-10-25T18:00:00.000Z',
  profiles: [
    { id: 'p-anna', name: 'Anna', avatar: '🦉', level: 'hospoda' },
    { id: 'p-ben', name: 'Ben', avatar: '🐻', level: 'lavice' },
    { id: 'p-cyril', name: 'Cyril', avatar: '🐣', level: 'piskoviste' },
  ],
  history: [
    {
      id: 'game-1',
      playedAt: '2026-10-24T17:00:00.000Z',
      themes: ['priroda'],
      contestants: [
        { id: 'p-anna', name: 'Anna', avatar: '🦉', level: 'hospoda', memberIds: ['p-anna'] },
        { id: 'p-ben', name: 'Ben', avatar: '🐻', level: 'lavice', memberIds: ['p-ben'] },
      ],
      ranking: [
        { contestantId: 'p-ben', score: 5, place: 1 },
        { contestantId: 'p-anna', score: 3, place: 2 },
      ],
      themeStats: [],
      best: null,
      answers: [
        { round: 0, turn: 0, contestantId: 'p-anna', questionId: 'hospoda-priroda-001', given: 'A', correct: true, basePoints: 3, points: 3 },
        { round: 0, turn: 1, contestantId: 'p-ben', questionId: 'lavice-cesko-svet-002', given: 'B', correct: true, basePoints: 5, points: 5 },
      ],
    },
    {
      id: 'game-2',
      playedAt: '2026-10-25T17:00:00.000Z',
      themes: ['jidlo'],
      contestants: [
        { id: 'team-1', name: 'Tým 1', avatar: '🚀', level: 'hospoda', memberIds: ['p-anna', 'p-ben'] },
        { id: 'p-gone', name: 'Dana', avatar: '🐱', level: 'piskoviste', memberIds: ['p-gone'] },
      ],
      ranking: [
        { contestantId: 'p-gone', score: 4, place: 1 },
        { contestantId: 'team-1', score: 2, place: 2 },
      ],
      answers: [
        { round: 0, turn: 0, contestantId: 'team-1', questionId: 'hospoda-jidlo-010', given: null, correct: false, basePoints: 0, points: 0 },
        { round: 0, turn: 1, contestantId: 'p-gone', questionId: 'piskoviste-jidlo-003', given: 'X', correct: true, basePoints: 4, points: 4 },
      ],
    },
  ],
  seen: { 'p-anna': ['hospoda-priroda-001', 'hospoda-jidlo-010'], 'p-cyril': ['piskoviste-priroda-001'], 'p-unknown': ['x'] },
};

let home: Household;

beforeAll(async () => {
  home = await makeHousehold('import');
});
afterAll(() => cleanup([home]));

describe('import helpers', () => {
  it('parses level and theme from the question id', () => {
    expect(parseQuestionId('lavice-cesko-svet-002')).toEqual({ level: 'lavice', theme: 'cesko-svet' });
    expect(parseQuestionId('weird')).toBeNull();
  });

  it('maps places to default league points', () => {
    expect([1, 2, 6, 7].map((p) => leaguePoints(p))).toEqual([10, 7, 1, 0]);
    expect(leaguePoints(null)).toBe(0);
  });

  it('rejects an export without valid profiles', () => {
    expect(() => parseTabletExport({ profiles: [{ id: 'x', name: '', level: 'hospoda' }] })).toThrow(/Profil 1/);
    expect(() => parseTabletExport([])).toThrow();
  });
});

describe('tablet import', () => {
  it('creates players, teams, finished matches and seen questions', async () => {
    const result = await importTablet(home.id, parseTabletExport(EXPORT));
    expect(result).toEqual({ players_created: 4, players_existing: 0, teams_created: 1, matches_created: 2, matches_skipped: 0, seen_added: 3 });

    const active = await listPlayers(home.id);
    expect(active.map((p) => p.legacy_id).sort()).toEqual(['p-anna', 'p-ben', 'p-cyril']);
    const all = await listPlayers(home.id, { includeArchived: true });
    expect(all.find((p) => p.legacy_id === 'p-gone')).toMatchObject({ name: 'Dana' });
    expect(all.find((p) => p.legacy_id === 'p-gone')!.archived_at).not.toBeNull();

    const teams = await listTeams(home.id);
    expect(teams).toHaveLength(1);
    expect(teams[0].member_ids).toHaveLength(2);

    const matches = await query<{ legacy_id: string; status: string; finished_at: Date }>(
      'SELECT legacy_id, status, finished_at FROM matches WHERE household_id = $1 ORDER BY legacy_id',
      [home.id],
    );
    expect(matches.map((m) => [m.legacy_id, m.status])).toEqual([['game-1', 'finished'], ['game-2', 'finished']]);
    expect(matches[0].finished_at.toISOString()).toBe('2026-10-24T17:00:00.000Z');

    const parts = await query<{ legacy_id: string | null; team_id: number | null; place: number; league_points: number }>(
      `SELECT p.legacy_id, mp.team_id, mp.place, mp.league_points
         FROM match_participants mp JOIN matches m ON m.id = mp.match_id LEFT JOIN players p ON p.id = mp.player_id
        WHERE m.legacy_id = 'game-2' AND m.household_id = $1 ORDER BY mp.place`,
      [home.id],
    );
    expect(parts.map((p) => [p.legacy_id, p.team_id !== null, p.place, p.league_points])).toEqual([
      ['p-gone', false, 1, 10],
      [null, true, 2, 7],
    ]);

    const answers = await query<{ theme: string; level: string; correct: boolean }>(
      `SELECT qa.theme, qa.level, qa.correct FROM quiz_answers qa JOIN matches m ON m.id = qa.match_id
        WHERE m.household_id = $1 ORDER BY qa.question_id`,
      [home.id],
    );
    expect(answers).toHaveLength(4);
    expect(answers[0]).toEqual({ theme: 'jidlo', level: 'hospoda', correct: false });
  });

  it('is idempotent: a second import creates nothing', async () => {
    const result = await importTablet(home.id, parseTabletExport(EXPORT));
    expect(result).toEqual({ players_created: 0, players_existing: 3, teams_created: 0, matches_created: 0, matches_skipped: 2, seen_added: 0 });
    const counts = await query<{ players: number; matches: number; parts: number; seen: number }>(
      `SELECT (SELECT COUNT(*)::int FROM players WHERE household_id = $1) AS players,
              (SELECT COUNT(*)::int FROM matches WHERE household_id = $1) AS matches,
              (SELECT COUNT(*)::int FROM match_participants mp JOIN matches m ON m.id = mp.match_id WHERE m.household_id = $1) AS parts,
              (SELECT COUNT(*)::int FROM seen_questions s JOIN players p ON p.id = s.player_id WHERE p.household_id = $1) AS seen`,
      [home.id],
    );
    expect(counts[0]).toEqual({ players: 4, matches: 2, parts: 4, seen: 3 });
  });

  it('answers 400 with a Czech message for a broken export', async () => {
    const err = await httpError(() => importRoute(fakeEvent({ household: home, body: { profiles: 'nope' } })));
    expect(err).toEqual({ status: 400, message: 'Export musí obsahovat profiles, history a seen.' });
  });

  it('answers 401 without a household', async () => {
    expect((await httpError(() => importRoute(fakeEvent({ body: EXPORT })))).status).toBe(401);
  });
});
