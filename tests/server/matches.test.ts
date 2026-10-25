import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '#lib/server/db.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { createMatch, findActiveMatchByRoomCode, finishMatch, getMatch, listParticipants, loadMatchState, saveMatchState } from '#lib/server/repo/matches.ts';
import { createPlayer, type Player } from '#lib/server/repo/players.ts';
import { getRatings, upsertRatings } from '#lib/server/repo/ratings.ts';
import { cleanup, makeHousehold } from './helpers.ts';

let home: Household;
let a: Player;
let b: Player;

beforeAll(async () => {
  home = await makeHousehold('matches');
  a = await createPlayer(home.id, { name: 'A', level: 'hospoda' });
  b = await createPlayer(home.id, { name: 'B', level: 'lavice' });
});
afterAll(() => cleanup([home]));

describe('matches repo', () => {
  it('saves and loads the engine state and marks the start', async () => {
    const code = `T${Math.floor(Math.random() * 1e6)}`;
    const m = await createMatch(home.id, { game_type: 'quiz', mode: 'live', room_code: code });
    expect(m.status).toBe('lobby');
    await saveMatchState(m.id, { phase: 'question', scores: { x: 1 } }, 'running');
    expect(await loadMatchState(m.id)).toEqual({ phase: 'question', scores: { x: 1 } });
    expect((await getMatch(home.id, m.id))!.started_at).not.toBeNull();
    expect((await findActiveMatchByRoomCode(code))!.id).toBe(m.id);
  });

  it('writes participants, answers and card rounds once', async () => {
    const m = await createMatch(home.id, { game_type: 'zoliky' });
    await finishMatch(
      m.id,
      [
        { player_id: a.id, place: 1, score: 20, league_points: 10 },
        { player_id: b.id, place: 2, score: 45, league_points: 7 },
      ],
      [{ player_id: a.id, question_id: 'hospoda-priroda-001', theme: 'priroda', level: 'hospoda', correct: true, points: 3 }],
      { card_rounds: [{ round_no: 1, player_id: a.id, points: 20 }, { round_no: 1, player_id: b.id, points: 45 }] },
    );
    expect((await getMatch(home.id, m.id))!.status).toBe('finished');
    expect((await listParticipants(m.id)).map((p) => [p.player_id, p.place])).toEqual([[a.id, 1], [b.id, 2]]);
    const rounds = await query('SELECT * FROM card_rounds WHERE match_id = $1', [m.id]);
    expect(rounds).toHaveLength(2);
    await expect(finishMatch(m.id, [])).rejects.toThrow(/already finished/);
  });

  it('rolls back everything when a participant is invalid', async () => {
    const m = await createMatch(home.id, { game_type: 'prsi' });
    await expect(finishMatch(m.id, [{ player_id: a.id, place: 1, score: 0 }, { place: 2, score: 0 }])).rejects.toThrow(/exactly one/);
    expect(await listParticipants(m.id)).toEqual([]);
    expect((await getMatch(home.id, m.id))!.status).toBe('lobby');
  });

  it('upserts ratings per player and game type', async () => {
    await upsertRatings([{ player_id: a.id, game_type: 'quiz', mu: 25, sigma: 8.3, games: 1 }]);
    await upsertRatings([{ player_id: a.id, game_type: 'quiz', mu: 27, sigma: 7.9, games: 2 }]);
    expect(await getRatings([a.id, b.id], 'quiz')).toMatchObject([{ player_id: a.id, mu: 27, games: 2 }]);
  });
});
