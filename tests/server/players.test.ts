import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { archivePlayer, createPlayer, getPlayer, listPlayers, updatePlayer } from '#lib/server/repo/players.ts';
import { addSeen, loadSeen } from '#lib/server/repo/seen.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { GET as listRoute, POST as createRoute } from '../../src/routes/api/players/+server.ts';
import { DELETE as archiveRoute, PATCH as patchRoute } from '../../src/routes/api/players/[id]/+server.ts';
import { POST as createTeamRoute } from '../../src/routes/api/teams/+server.ts';
import { cleanup, fakeEvent, httpError, makeHousehold } from './helpers.ts';

let home: Household;
let other: Household;

beforeAll(async () => {
  home = await makeHousehold('players');
  other = await makeHousehold('players-other');
});
afterAll(() => cleanup([home, other]));

describe('players repo', () => {
  it('creates a player with defaults', async () => {
    const p = await createPlayer(home.id, { name: 'Adam', level: 'lavice' });
    expect(p).toMatchObject({ household_id: home.id, name: 'Adam', level: 'lavice', avatar: '🙂', birth_year: null, archived_at: null });
  });

  it('lists only the household players without archived ones', async () => {
    const eva = await createPlayer(home.id, { name: 'Eva', level: 'hospoda', avatar: '🦊', birth_year: 1985 });
    await createPlayer(other.id, { name: 'Cizí', level: 'hospoda' });
    await archivePlayer(home.id, eva.id);
    expect((await listPlayers(home.id)).map((p) => p.name)).toEqual(['Adam']);
    expect((await listPlayers(home.id, { includeArchived: true })).map((p) => p.name)).toEqual(['Adam', 'Eva']);
  });

  it('updates only the given fields', async () => {
    const [adam] = await listPlayers(home.id);
    const updated = await updatePlayer(home.id, adam.id, { level: 'hospoda' });
    expect(updated).toMatchObject({ name: 'Adam', level: 'hospoda' });
  });

  it('does not touch players of another household', async () => {
    const [adam] = await listPlayers(home.id);
    expect(await updatePlayer(other.id, adam.id, { name: 'X' })).toBeNull();
    expect(await getPlayer(other.id, adam.id)).toBeNull();
  });

  it('stores seen questions once per player', async () => {
    const [adam] = await listPlayers(home.id);
    expect(await addSeen(adam.id, ['q1', 'q2', 'q2'])).toBe(2);
    expect(await addSeen(adam.id, ['q2', 'q3'])).toBe(1);
    expect((await loadSeen([adam.id]))[String(adam.id)].sort()).toEqual(['q1', 'q2', 'q3']);
  });
});

describe('players API', () => {
  it('answers 401 without a household', async () => {
    expect((await httpError(() => listRoute(fakeEvent()))).status).toBe(401);
  });

  it('creates a player and validates the level', async () => {
    const res = await createRoute(fakeEvent({ household: home, body: { name: '  Bára  ', level: 'piskoviste', birth_year: 2021 } }));
    expect(res.status).toBe(201);
    expect((await res.json()).player).toMatchObject({ name: 'Bára', level: 'piskoviste', birth_year: 2021 });
    const err = await httpError(() => createRoute(fakeEvent({ household: home, body: { name: 'X', level: 'expert' } })));
    expect(err.status).toBe(400);
  });

  it('stores the new levels kocarek and prvnacek', async () => {
    for (const level of ['kocarek', 'prvnacek']) {
      const res = await createRoute(fakeEvent({ household: home, body: { name: `Dítě ${level}`, level } }));
      expect(res.status).toBe(201);
      expect((await res.json()).player.level).toBe(level);
    }
  });

  it('answers 404 for a player of another household', async () => {
    const [adam] = await listPlayers(home.id);
    const err = await httpError(() => patchRoute(fakeEvent({ household: other, params: { id: String(adam.id) }, body: { name: 'Y' } })));
    expect(err).toEqual({ status: 404, message: 'Takový hráč neexistuje.' });
  });

  it('archives a player via DELETE', async () => {
    const p = await createPlayer(home.id, { name: 'Dočasný', level: 'hospoda' });
    const res = await archiveRoute(fakeEvent({ household: home, params: { id: String(p.id) } }));
    expect((await res.json()).player.archived_at).not.toBeNull();
  });

  it('rejects a team with players of another household', async () => {
    const [adam] = await listPlayers(home.id);
    const stranger = await createPlayer(other.id, { name: 'Host', level: 'hospoda' });
    const err = await httpError(() => createTeamRoute(fakeEvent({ household: home, body: { name: 'Mix', member_ids: [adam.id, stranger.id] } })));
    expect(err.status).toBe(400);
  });

  it('creates a team with members', async () => {
    const players = await listPlayers(home.id);
    const ids = players.map((p) => p.id).slice(0, 2);
    const res = await createTeamRoute(fakeEvent({ household: home, body: { name: 'Rodiče', member_ids: ids } }));
    expect(res.status).toBe(201);
    expect((await res.json()).team).toMatchObject({ name: 'Rodiče', member_ids: [...ids].sort((a, b) => a - b) });
  });
});
