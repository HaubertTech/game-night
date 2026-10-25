import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Household } from '#lib/server/repo/households.ts';
import { createPlayer, type Player } from '#lib/server/repo/players.ts';
import { POST as postMatch } from '../../src/routes/api/matches/+server.ts';
import { POST as postAction } from '../../src/routes/api/matches/[id]/action/+server.ts';
import { POST as postQuiz } from '../../src/routes/api/matches/quiz/+server.ts';
import { POST as postNight } from '../../src/routes/api/nights/+server.ts';
import { cleanup, fakeEvent, httpError, makeHousehold } from '../server/helpers.ts';

let home: Household;
let a: Player;
let b: Player;

beforeAll(async () => {
  home = await makeHousehold('api');
  a = await createPlayer(home.id, { name: 'A', level: 'hospoda' });
  b = await createPlayer(home.id, { name: 'B', level: 'hospoda' });
});
afterAll(() => cleanup([home]));

describe('league API', () => {
  it('requires a logged-in household', async () => {
    expect((await httpError(() => postNight(fakeEvent({ body: {} })))).status).toBe(401);
  });

  it('creates a night and a card match in it, finish answers with the recorded match', async () => {
    const night = await (await postNight(fakeEvent({ body: { played_on: '2026-10-25' }, household: home }))).json();
    const created = await (await postMatch(fakeEvent({ body: { game_type: 'prsi', player_ids: [a.id, b.id], night_id: night.night.id }, household: home }))).json();
    const id = String(created.match.id);
    const order = [String(a.id), String(b.id)];
    await postAction(fakeEvent({ body: { action: { type: 'record', order } }, household: home, params: { id } }));
    const done = await (await postAction(fakeEvent({ body: { action: { type: 'finish' } }, household: home, params: { id } }))).json();
    expect(done.match.status).toBe('finished');
    const again = await httpError(() => postAction(fakeEvent({ body: { action: { type: 'undo' } }, household: home, params: { id } })));
    expect(again).toMatchObject({ status: 409, message: 'Partie je už zapsaná.' });
  });

  it('rejects an unknown card action with 400', async () => {
    const created = await (await postMatch(fakeEvent({ body: { game_type: 'zoliky', player_ids: [a.id, b.id] }, household: home }))).json();
    const err = await httpError(() => postAction(fakeEvent({ body: { action: { type: 'hack' } }, household: home, params: { id: String(created.match.id) } })));
    expect(err.status).toBe(400);
  });

  it('answers 409 with the missing tablet profiles', async () => {
    const game = {
      id: 'g-api-1',
      playedAt: '2026-10-25T17:00:00.000Z',
      contestants: [
        { id: 'x1', name: 'X', avatar: '🦊', level: 'hospoda', memberIds: ['x1'] },
        { id: 'x2', name: 'Y', avatar: '🐸', level: 'hospoda', memberIds: ['x2'] },
      ],
      ranking: [
        { contestantId: 'x1', score: 3, place: 1 },
        { contestantId: 'x2', score: 1, place: 2 },
      ],
      answers: [],
    };
    const res = await postQuiz(fakeEvent({ body: { game }, household: home }));
    expect(res.status).toBe(409);
    expect((await res.json()).missing.map((p: { name: string }) => p.name)).toEqual(['X', 'Y']);
    const ok = await postQuiz(fakeEvent({ body: { game, create_missing: true }, household: home }));
    expect((await ok.json()).status).toBe('recorded');
  });
});
