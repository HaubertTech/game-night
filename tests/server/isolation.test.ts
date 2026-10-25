// Two households side by side: everything addressed by id or room code stays inside the
// household of the session. A foreign id answers 404 (or 400 for lists of ids in a body),
// never data of the other household.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '#lib/live/protocol.ts';
import { MemoryRoomStore, type Scheduler } from '#lib/server/rooms.ts';
import type { Account } from '#lib/server/repo/accounts.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { createPlayer, type Player } from '#lib/server/repo/players.ts';
import { createTeam, type Team } from '#lib/server/repo/teams.ts';
import { createCardMatch } from '#lib/server/services/cards.ts';
import { exportHousehold } from '#lib/server/services/household-data.ts';
import { createNight } from '#lib/server/services/nights.ts';
import { createSeason } from '#lib/server/services/seasons.ts';
import { createLiveHub, getLiveHub, setLiveHub, type LiveHub } from '#lib/server/ws.ts';
import { GET as listPlayers } from '../../src/routes/api/players/+server.ts';
import { DELETE as archivePlayer, PATCH as patchPlayer } from '../../src/routes/api/players/[id]/+server.ts';
import { POST as erasePlayerRoute } from '../../src/routes/api/players/[id]/erase/+server.ts';
import { GET as playerStats } from '../../src/routes/api/stats/players/[id]/+server.ts';
import { GET as nightGet, PATCH as nightPatch } from '../../src/routes/api/nights/[id]/+server.ts';
import { POST as nightMatches } from '../../src/routes/api/nights/[id]/matches/+server.ts';
import { GET as listNights } from '../../src/routes/api/nights/+server.ts';
import { POST as newCardMatch } from '../../src/routes/api/matches/+server.ts';
import { DELETE as matchDelete, GET as matchGet } from '../../src/routes/api/matches/[id]/+server.ts';
import { POST as matchAction } from '../../src/routes/api/matches/[id]/action/+server.ts';
import { GET as seasonGet } from '../../src/routes/api/seasons/[id]/+server.ts';
import { GET as listTeams, POST as newTeam } from '../../src/routes/api/teams/+server.ts';
import { DELETE as teamDelete } from '../../src/routes/api/teams/[id]/+server.ts';
import { POST as newRoom } from '../../src/routes/api/rooms/+server.ts';
import { GET as roomInfo } from '../../src/routes/api/rooms/[code]/+server.ts';
import { DELETE as inviteDelete } from '../../src/routes/api/invites/[id]/+server.ts';
import { GET as exportRoute } from '../../src/routes/api/household/export/+server.ts';
import { cleanup, fakeEvent, httpError, makeManager } from './helpers.ts';

interface Side {
  household: Household;
  account: Account;
  players: Player[];
  team: Team;
  nightId: number;
  seasonId: number;
  matchId: number;
}

let a: Side;
let b: Side;
let hub: LiveHub;
let previous: LiveHub;
const noTimers: Scheduler = { set: () => 0, clear: () => undefined };

async function side(label: string): Promise<Side> {
  const m = await makeManager(label);
  const players = [
    await createPlayer(m.household.id, { name: `${label} Táta`, level: 'hospoda' }),
    await createPlayer(m.household.id, { name: `${label} Kuba`, level: 'lavice' }),
  ];
  const team = await createTeam(m.household.id, { name: `${label} tým`, member_ids: players.map((p) => p.id) });
  const night = await createNight(m.household.id, {});
  const season = await createSeason(m.household.id, { name: `${label} sezóna`, starts_on: '2026-01-01', ends_on: '2026-12-31' });
  const match = await createCardMatch(m.household.id, { gameType: 'prsi', playerIds: players.map((p) => p.id), nightId: night.id });
  return { household: m.household, account: m.account, players, team, nightId: night.id, seasonId: season.id, matchId: match.id };
}

/** Event of household A (as manager) addressing something. */
const asA = (opts: Parameters<typeof fakeEvent>[0] = {}) => fakeEvent({ household: a.household, account: a.account, ...opts });
const status = async (fn: () => unknown) => (await httpError(fn)).status;

beforeAll(async () => {
  a = await side('Izolace A');
  b = await side('Izolace B');
  previous = getLiveHub();
  hub = createLiveHub({ store: new MemoryRoomStore(), scheduler: noTimers, loadPool: () => [] });
  setLiveHub(hub);
});

afterAll(async () => {
  hub.rooms.dispose();
  setLiveHub(previous);
  await cleanup([a.household, b.household]);
});

describe('lists contain only the own household', () => {
  it('players, teams and evenings', async () => {
    const players = (await (await listPlayers(asA({ url: 'http://localhost/api/players?archived=1' }))).json()).players as Player[];
    expect(players.map((p) => p.id).sort()).toEqual(a.players.map((p) => p.id).sort());
    const teams = (await (await listTeams(asA())).json()).teams as Team[];
    expect(teams.map((t) => t.id)).toEqual([a.team.id]);
    const nights = (await (await listNights(asA({ url: 'http://localhost/api/nights' }))).json()).nights as { id: number }[];
    expect(nights.map((n) => n.id)).not.toContain(b.nightId);
  });

  it('the export of one household has nothing of the other', async () => {
    const data = JSON.stringify(await exportHousehold(a.household.id));
    for (const p of b.players) expect(data).not.toContain(p.name);
    expect(data).not.toContain(b.household.name);
    const res = await exportRoute(asA());
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="domaci-liga-export-/);
  });
});

describe('a foreign id answers 404', () => {
  it('player: edit, archive, erase, statistics', async () => {
    const id = String(b.players[0].id);
    expect(await status(() => patchPlayer(asA({ method: 'PATCH', params: { id }, body: { name: 'Hacker' } })))).toBe(404);
    expect(await status(() => archivePlayer(asA({ method: 'DELETE', params: { id } })))).toBe(404);
    expect(await status(() => erasePlayerRoute(asA({ method: 'POST', params: { id } })))).toBe(404);
    expect(await status(() => playerStats(asA({ params: { id } })))).toBe(404);
  });

  it('evening: detail, closing, new match in it', async () => {
    const id = String(b.nightId);
    expect(await status(() => nightGet(asA({ params: { id } })))).toBe(404);
    expect(await status(() => nightPatch(asA({ method: 'PATCH', params: { id }, body: { status: 'closed' } })))).toBe(404);
    const err = await httpError(() => nightMatches(asA({ params: { id }, body: { game_type: 'prsi', player_ids: a.players.map((p) => p.id) } })));
    expect(err.status).toBe(404);
  });

  it('card match: detail, action, abandon', async () => {
    const id = String(b.matchId);
    expect(await status(() => matchGet(asA({ params: { id } })))).toBe(404);
    expect(await status(() => matchAction(asA({ params: { id }, body: { action: { type: 'undo' } } })))).toBe(404);
    expect(await status(() => matchDelete(asA({ method: 'DELETE', params: { id } })))).toBe(404);
  });

  it('season, team, invite', async () => {
    expect(await status(() => seasonGet(asA({ params: { id: String(b.seasonId) } })))).toBe(404);
    expect(await status(() => teamDelete(asA({ method: 'DELETE', params: { id: String(b.team.id) } })))).toBe(404);
    expect(await status(() => inviteDelete(asA({ method: 'DELETE', params: { id: '999999999' } })))).toBe(404);
  });
});

describe('foreign players in a body are refused', () => {
  it('card match, team and live room', async () => {
    const mixed = [a.players[0].id, b.players[0].id];
    expect(await status(() => newCardMatch(asA({ body: { game_type: 'prsi', player_ids: mixed } })))).toBe(400);
    expect(await status(() => newTeam(asA({ body: { name: 'Mix', member_ids: mixed } })))).toBe(400);
    expect(await status(() => newRoom(asA({ body: { player_ids: mixed, themes: ['priroda'] } })))).toBe(400);
    expect(await status(() => newRoom(asA({ body: { game: 'mjz', player_ids: mixed } })))).toBe(400);
    expect(await status(() => newRoom(asA({ body: { player_ids: [a.players[0].id], themes: ['priroda'], night_id: b.nightId } })))).toBe(404);
  });

  it('nothing of the other household changed', async () => {
    const players = (await (await listPlayers(fakeEvent({ household: b.household, url: 'http://localhost/api/players' }))).json()).players as Player[];
    expect(players.map((p) => p.name).sort()).toEqual(b.players.map((p) => p.name).sort());
  });
});

describe('live rooms', () => {
  it('a phone with the code sees only the players of that room', async () => {
    const res = await newRoom(asA({ body: { game: 'mjz', player_ids: a.players.map((p) => p.id), rounds: 1 } }));
    expect(res.status).toBe(201);
    const { code } = await res.json();
    const info = await (await roomInfo(fakeEvent({ params: { code } }))).json();
    const names = info.contestants.map((c: { name: string }) => c.name);
    expect(names.sort()).toEqual(a.players.map((p) => p.name).sort());
    expect(JSON.stringify(info)).not.toContain(b.household.name);
    expect(JSON.stringify(info)).not.toContain('host_token');
  });

  it('a phone cannot take the host role of another household’s room without its token', async () => {
    const { code } = await (await newRoom(asA({ body: { game: 'mjz', player_ids: a.players.map((p) => p.id), rounds: 1 } }))).json();
    const out: ServerMessage[] = [];
    hub.rooms.connect('intruder');
    const send = (hub.rooms as unknown as { opts: { send: (id: string, m: ServerMessage) => void } }).opts;
    const original = send.send;
    send.send = (id, m) => (id === 'intruder' ? out.push(m) : original(id, m));
    try {
      await hub.rooms.handle('intruder', { v: PROTOCOL_VERSION, type: 'hello', code, role: 'host', token: 'guessed' } as ClientMessage);
      await hub.rooms.flush();
    } finally {
      send.send = original;
    }
    expect(out.some((m) => m.type === 'error')).toBe(true);
    expect(out.some((m) => m.type === 'welcome')).toBe(false);
  });

  it('limits unfinished rooms per household', async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) {
      try {
        last = (await newRoom(asA({ body: { game: 'mjz', player_ids: a.players.map((p) => p.id), rounds: 1 } }))).status;
      } catch (err) {
        last = (err as { status: number }).status;
      }
      if (last === 409) break;
    }
    expect(last).toBe(409);
    // The other household is not affected by A's rooms.
    const other = await newRoom(fakeEvent({ household: b.household, body: { game: 'mjz', player_ids: b.players.map((p) => p.id), rounds: 1 } }));
    expect(other.status).toBe(201);
  });
});
