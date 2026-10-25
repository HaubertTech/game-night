// POST /api/matches/clovece: a game from one tablet goes to the league once; the server replays it
// from the seed and the history and refuses unfinished games, made-up histories and strangers.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adviseClovece } from '#lib/games/clovece/ai.ts';
import { applyClovece, createCloveceGame, type CloveceState } from '#lib/games/clovece/engine.ts';
import { closePool } from '#lib/server/db.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { listParticipants } from '#lib/server/repo/matches.ts';
import { createPlayer, type Player } from '#lib/server/repo/players.ts';
import { POST } from '../../src/routes/api/matches/clovece/+server.ts';
import { cleanup, fakeEvent, httpError, makeHousehold } from './helpers.ts';

let home: Household;
let other: Household;
let a: Player;
let b: Player;
let stranger: Player;

beforeAll(async () => {
  home = await makeHousehold('clovece-tablet');
  other = await makeHousehold('clovece-other');
  a = await createPlayer(home.id, { name: 'Táta', level: 'hospoda' });
  b = await createPlayer(home.id, { name: 'Kuba', level: 'lavice' });
  stranger = await createPlayer(other.id, { name: 'Cizí', level: 'hospoda' });
});
afterAll(async () => {
  await cleanup([home, other]);
  await closePool();
});

function play(players: { id: string; name: string; ai?: 1 | 2 | 3 | null }[], seed: number, steps = Infinity, id = `t-${seed}-${players.length}`): CloveceState {
  let s = createCloveceGame({ id, createdAt: '2026-10-25T18:00:00.000Z', seed, players, settings: { pawns: 2 } });
  for (let n = 0; n < steps && s.phase === 'playing'; n++) {
    const r = applyClovece(s, { ...adviseClovece(s, 2).command, by: { role: 'system' }, now: n });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

const body = (s: CloveceState, extra: Record<string, unknown> = {}) => ({
  game: { id: s.id, createdAt: s.createdAt, seed: s.seed, settings: s.settings, players: s.players.map((p) => ({ id: p.id, ai: p.ai })), history: s.history, ...extra },
});

describe('POST /api/matches/clovece', () => {
  it('records two people and a computer once; the computer is left out', async () => {
    const s = play([{ id: `p${a.id}`, name: 'Táta' }, { id: `p${b.id}`, name: 'Kuba' }, { id: 'ai1', name: 'Robík', ai: 3 }], 5);
    const res = await POST(fakeEvent({ body: body(s), household: home }));
    const out = await res.json();
    expect(out.status).toBe('recorded');
    const seats = await listParticipants(out.match_id);
    expect(seats.map((x) => x.player_id).sort()).toEqual([a.id, b.id].sort());
    for (const x of seats) expect(x.place).toBe(s.finished.indexOf(`p${x.player_id}`) + 1);
    const again = await (await POST(fakeEvent({ body: body(s), household: home }))).json();
    expect(again).toEqual({ status: 'already', match_id: out.match_id });
  });

  it('refuses an unfinished game and a changed history', async () => {
    const s = play([{ id: `p${a.id}`, name: 'Táta' }, { id: `p${b.id}`, name: 'Kuba' }], 8, 30, 'unfinished');
    expect((await httpError(() => POST(fakeEvent({ body: body(s), household: home })))).message).toMatch(/neskončila/);
    const done = play([{ id: `p${a.id}`, name: 'Táta' }, { id: `p${b.id}`, name: 'Kuba' }], 9, Infinity, 'forged');
    const forged = [...done.history];
    forged[1] = forged[1] === -1 ? 3 : -1;
    expect((await httpError(() => POST(fakeEvent({ body: body(done, { history: forged }), household: home })))).status).toBe(400);
  });

  it('refuses players of another household, guests and a computer-only table', async () => {
    const s = play([{ id: `p${a.id}`, name: 'Táta' }, { id: `p${stranger.id}`, name: 'Cizí' }], 4, Infinity, 'stranger');
    expect((await httpError(() => POST(fakeEvent({ body: body(s), household: home })))).message).toMatch(/domácnosti/);
    const guest = play([{ id: `p${a.id}`, name: 'Táta' }, { id: 'host-1', name: 'Host' }], 4, Infinity, 'guest');
    expect((await httpError(() => POST(fakeEvent({ body: body(guest), household: home })))).status).toBe(400);
    const bots = play([{ id: 'ai1', name: 'A', ai: 1 }, { id: 'ai2', name: 'B', ai: 2 }], 4, Infinity, 'bots');
    expect((await httpError(() => POST(fakeEvent({ body: body(bots), household: home })))).message).toMatch(/bez lidí/);
  });
});
