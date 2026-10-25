import { afterAll, describe, expect, it } from 'vitest';
import { one, query } from '#lib/server/db.ts';
import { getAccount } from '#lib/server/repo/accounts.ts';
import { getHousehold, type Household } from '#lib/server/repo/households.ts';
import { createPlayer, getPlayer } from '#lib/server/repo/players.ts';
import { createTeam } from '#lib/server/repo/teams.ts';
import { addSeen } from '#lib/server/repo/seen.ts';
import { createCardMatch } from '#lib/server/services/cards.ts';
import { ERASED_PLAYER_NAME, EXPORT_FORMAT, exportHousehold } from '#lib/server/services/household-data.ts';
import { GET as exportRoute } from '../../src/routes/api/household/export/+server.ts';
import { DELETE as deleteHousehold } from '../../src/routes/api/household/+server.ts';
import { POST as eraseRoute } from '../../src/routes/api/players/[id]/erase/+server.ts';
import { cleanup, fakeCookies, fakeEvent, httpError, makeManager } from './helpers.ts';

const created: Household[] = [];
afterAll(() => cleanup(created));

describe('export', () => {
  it('contains the household, managers, players and games, without password hashes', async () => {
    const m = await makeManager('export');
    created.push(m.household);
    const p1 = await createPlayer(m.household.id, { name: 'Anička', level: 'lavice', birth_year: 2017 });
    const p2 = await createPlayer(m.household.id, { name: 'Táta', level: 'hospoda' });
    await createCardMatch(m.household.id, { gameType: 'prsi', playerIds: [p1.id, p2.id] });
    const res = await exportRoute(fakeEvent({ household: m.household, account: m.account }));
    const data = await res.json();
    expect(data.format).toBe(EXPORT_FORMAT);
    expect(data.household.name).toBe(m.household.name);
    expect(data.accounts).toEqual([expect.objectContaining({ email: m.email })]);
    expect(data.players.map((p: { name: string }) => p.name).sort()).toEqual(['Anička', 'Táta']);
    expect(data.matches).toHaveLength(1);
    const text = JSON.stringify(data);
    expect(text).not.toContain('scrypt$');
    expect(text).not.toContain('pin_hash');
  });

  it('is for the manager only, not for a PIN device', async () => {
    const m = await makeManager('export-pin');
    created.push(m.household);
    expect((await httpError(() => exportRoute(fakeEvent({ household: m.household })))).status).toBe(403);
  });
});

describe('erasing a player', () => {
  it('anonymizes the profile, team names and stored game states, keeps the results', async () => {
    const m = await makeManager('erase');
    created.push(m.household);
    const kid = await createPlayer(m.household.id, { name: 'Kubíček', level: 'piskoviste', birth_year: 2020 });
    const mum = await createPlayer(m.household.id, { name: 'Máma', level: 'hospoda' });
    const team = await createTeam(m.household.id, { name: 'Kubíček + Máma', member_ids: [kid.id, mum.id] });
    await addSeen(kid.id, ['q1', 'q2']);
    const match = await createCardMatch(m.household.id, { gameType: 'prsi', playerIds: [kid.id, mum.id] });
    const res = await eraseRoute(fakeEvent({ household: m.household, account: m.account, params: { id: String(kid.id) } }));
    expect(res.status).toBe(200);
    const after = (await getPlayer(m.household.id, kid.id))!;
    expect(after).toMatchObject({ name: ERASED_PLAYER_NAME, birth_year: null, avatar: '👤' });
    expect(after.archived_at).not.toBeNull();
    expect((await one<{ name: string }>('SELECT name FROM teams WHERE id = $1', [team.id]))!.name).toBe(`${ERASED_PLAYER_NAME} + Máma`);
    const state = (await one<{ state: unknown }>('SELECT state FROM matches WHERE id = $1', [match.id]))!.state;
    expect(JSON.stringify(state)).not.toContain('Kubíček');
    expect(JSON.stringify(state)).toContain('Máma');
    expect(await query('SELECT 1 FROM seen_questions WHERE player_id = $1', [kid.id])).toHaveLength(0);
    // Results stay: the match and the (anonymized) player row are still there.
    expect(await query('SELECT 1 FROM matches WHERE id = $1', [match.id])).toHaveLength(1);
  });

  it('needs the manager login', async () => {
    const m = await makeManager('erase-pin');
    created.push(m.household);
    const p = await createPlayer(m.household.id, { name: 'Ema', level: 'lavice' });
    expect((await httpError(() => eraseRoute(fakeEvent({ household: m.household, params: { id: String(p.id) }, method: 'POST' })))).status).toBe(403);
  });
});

describe('deleting the household', () => {
  it('needs the exact name and the password, then removes everything', async () => {
    const m = await makeManager('delete');
    const p = await createPlayer(m.household.id, { name: 'Ema', level: 'lavice' });
    const ev = (body: unknown) => fakeEvent({ method: 'DELETE', household: m.household, account: m.account, body, cookies: fakeCookies() });
    expect((await httpError(() => deleteHousehold(ev({ confirm_name: 'jiný název', password: m.password })))).status).toBe(400);
    expect((await httpError(() => deleteHousehold(ev({ confirm_name: m.household.name, password: 'spatne-heslo-1' })))).status).toBe(400);
    const res = await deleteHousehold(ev({ confirm_name: m.household.name, password: m.password }));
    expect(res.status).toBe(200);
    expect(await getHousehold(m.household.id)).toBeNull();
    expect(await getAccount(m.account.id)).toBeNull();
    expect(await getPlayer(m.household.id, p.id)).toBeNull();
    expect(await exportHousehold(m.household.id)).toEqual({});
  });
});
