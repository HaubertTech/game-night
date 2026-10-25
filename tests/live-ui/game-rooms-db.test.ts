// POST /api/rooms for „Řekni, ukaž, nakresli“ and „Město, jméno, zvíře“ with the DB room store:
// teams from players, the finished game recorded (game_type, team seats, seen word cards, ratings),
// and migration 002 (game types) applied twice.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AktivityState } from '#lib/games/aktivity/engine.ts';
import type { AktivityCard } from '#lib/games/aktivity/types.ts';
import type { MjzState } from '#lib/games/mjz/engine.ts';
import { PROTOCOL_VERSION, type ClientMessage } from '#lib/live/protocol.ts';
import { one, query } from '#lib/server/db.ts';
import { MIGRATIONS_DIR } from '#lib/server/migrate.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { listParticipants } from '#lib/server/repo/matches.ts';
import { createPlayer, type Player } from '#lib/server/repo/players.ts';
import { DbRoomStore } from '#lib/server/room-store-db.ts';
import type { Scheduler } from '#lib/server/rooms.ts';
import { createLiveHub, getLiveHub, setLiveHub, type LiveHub } from '#lib/server/ws.ts';
import { POST as postRoom } from '../../src/routes/api/rooms/+server.ts';
import { GET as getRoom } from '../../src/routes/api/rooms/[code]/+server.ts';
import { cleanup, fakeEvent, httpError, makeHousehold } from '../server/helpers.ts';

const v = PROTOCOL_VERSION;
type Outgoing = ClientMessage extends infer M ? (M extends unknown ? Omit<M, 'v'> : never) : never;
const noTimers: Scheduler = { set: () => 0, clear: () => undefined };
const cards: AktivityCard[] = (['hospoda', 'lavice'] as const).flatMap((level) =>
  Array.from({ length: 15 }, (_, i) => ({
    id: `${level}-${String(900 + i)}`,
    level,
    word: `${level} slovo ${i}`,
    mode: 'ukaz' as const,
    difficulty: ([3, 4, 5] as const)[i % 3],
  })),
);

let home: Household;
let p: Player[];
let hub: LiveHub;
let previous: LiveHub;

beforeAll(async () => {
  home = await makeHousehold('game-rooms');
  p = [];
  for (const [name, level] of [['Táta', 'hospoda'], ['Máma', 'hospoda'], ['Anna', 'lavice'], ['Petr', 'hospoda']] as const) {
    p.push(await createPlayer(home.id, { name, level }));
  }
  previous = getLiveHub();
  hub = createLiveHub({ store: new DbRoomStore(), scheduler: noTimers, loadAktivityCards: () => cards });
  setLiveHub(hub);
});
afterAll(async () => {
  hub.rooms.dispose();
  setLiveHub(previous);
  await cleanup([home]);
});

let clientSeq = 0;
function client() {
  const id = `c${++clientSeq}`;
  hub.rooms.connect(id);
  return async (m: Outgoing) => {
    await hub.rooms.handle(id, { v, ...m } as ClientMessage);
    await hub.rooms.flush();
  };
}

async function create(body: Record<string, unknown>) {
  const res = await postRoom(fakeEvent({ body, household: home }));
  expect(res.status).toBe(201);
  return (await res.json()) as { code: string; host_token: string; game: string };
}

const matchRow = (code: string) =>
  one<{ id: number; status: string; game_type: string; night_id: number | null }>(
    'SELECT id, status, game_type, night_id FROM matches WHERE room_code = $1 ORDER BY id DESC LIMIT 1',
    [code],
  );

describe('POST /api/rooms: aktivity', () => {
  it('validates the teams', async () => {
    const single = await httpError(() => postRoom(fakeEvent({ body: { game: 'aktivity', teams: [{ player_ids: [p[0].id, p[1].id] }] }, household: home })));
    expect(single.status).toBe(400);
    const twice = await httpError(() =>
      postRoom(fakeEvent({ body: { game: 'aktivity', teams: [{ player_ids: [p[0].id, p[1].id] }, { player_ids: [p[1].id, p[2].id] }] }, household: home })),
    );
    expect(twice.message).toMatch(/ve dvou týmech/);
    const alone = await httpError(() =>
      postRoom(fakeEvent({ body: { game: 'aktivity', teams: [{ player_ids: [p[0].id] }, { player_ids: [p[1].id, p[2].id] }] }, household: home })),
    );
    expect(alone.message).toMatch(/aspoň dva hráče/);
    const unknown = await httpError(() => postRoom(fakeEvent({ body: { game: 'golf' }, household: home })));
    expect(unknown.status).toBe(400);
  });

  it('creates teams from players, plays to the end and records team seats and seen words', async () => {
    const body = { game: 'aktivity', teams: [{ player_ids: [p[0].id, p[1].id] }, { player_ids: [p[2].id, p[3].id] }], timer_seconds: 30, goal: { kind: 'rounds', rounds: 1 } };
    const { code, host_token: token, game } = await create(body);
    expect(game).toBe('aktivity');
    const row = await matchRow(code);
    expect(row).toMatchObject({ status: 'lobby', game_type: 'aktivity' });

    const info = await (await getRoom(fakeEvent({ params: { code } }))).json();
    expect(info).toMatchObject({ game: 'aktivity', phase: 'setup' });
    expect(info.contestants.map((c: { id: string }) => c.id).sort()).toEqual(p.map((x) => `p${x.id}`).sort());

    const state = hub.rooms.getState<AktivityState>(code)!;
    expect(state.teams.map((t) => t.name)).toEqual(['Táta + Máma', 'Anna + Petr']);
    // The same pair reuses its team in the next game.
    const again = await create(body);
    expect(hub.rooms.getState<AktivityState>(again.code)!.teams.map((t) => t.id)).toEqual(state.teams.map((t) => t.id));

    const tv = client();
    await tv({ type: 'hello', code, role: 'host', token });
    await tv({ type: 'action', game: 'aktivity', action: { type: 'start' } });
    await tv({ type: 'action', game: 'aktivity', action: { type: 'startTurn', difficulty: 4 } });
    await tv({ type: 'action', game: 'aktivity', action: { type: 'guessed' } });
    await tv({ type: 'action', game: 'aktivity', action: { type: 'next' } });
    await tv({ type: 'action', game: 'aktivity', action: { type: 'startTurn', difficulty: 3 } });
    await tv({ type: 'action', game: 'aktivity', action: { type: 'skip' } });
    await tv({ type: 'action', game: 'aktivity', action: { type: 'next' } });
    const done = hub.rooms.getState<AktivityState>(code)!;
    expect(done.phase).toBe('finished');

    expect((await matchRow(code))!.status).toBe('finished');
    const seats = await listParticipants(row!.id);
    expect(seats).toHaveLength(2);
    expect(seats.every((s) => s.team_id !== null && s.player_id === null)).toBe(true);
    const winner = seats.find((s) => s.place === 1)!;
    expect(`t${winner.team_id}`).toBe(done.teams[0].id);
    expect(Number(winner.score)).toBe(4);

    const seen = await query<{ question_id: string }>('SELECT question_id FROM seen_questions WHERE player_id = $1 ORDER BY 1', [p[3].id]);
    expect(seen.map((r) => r.question_id)).toEqual(done.history.map((h) => h.cardId).sort());
    const ratings = await query<{ game_type: string }>('SELECT game_type FROM ratings WHERE player_id = $1', [p[0].id]);
    expect(ratings.map((r) => r.game_type)).toContain('aktivity');

    // Seen cards go to the end of the deck of the next game.
    const next = await create(body);
    const decks = hub.rooms.getState<AktivityState>(next.code)!.decks;
    const played = new Set(done.history.map((h) => h.cardId));
    for (const ids of [...Object.values(decks.hospoda!), ...Object.values(decks.lavice!)]) {
      const firstSeen = ids.findIndex((id) => played.has(id));
      if (firstSeen >= 0) expect(ids.slice(firstSeen).every((id) => played.has(id))).toBe(true);
    }
  });
});

describe('POST /api/rooms: mjz', () => {
  it('rejects a bad category set and an empty table', async () => {
    expect((await httpError(() => postRoom(fakeEvent({ body: { game: 'mjz', player_ids: [p[0].id], category_set: 'x' }, household: home })))).status).toBe(400);
    expect((await httpError(() => postRoom(fakeEvent({ body: { game: 'mjz', player_ids: [] }, household: home })))).status).toBe(400);
  });

  it('plays one round and records the players with their points', async () => {
    const { code, host_token: token } = await create({ game: 'mjz', player_ids: [p[0].id, p[1].id], category_set: 'kids', rounds: 1, time_seconds: 60 });
    const row = await matchRow(code);
    expect(row).toMatchObject({ status: 'lobby', game_type: 'mjz' });
    const state = hub.rooms.getState<MjzState>(code)!;
    expect(state.settings.categories.map((c) => c.id)).toEqual(['jmeno', 'zvire', 'vec', 'jidlo', 'barva-hracka']);

    const tv = client();
    const a = client();
    const b = client();
    await tv({ type: 'hello', code, role: 'host', token });
    await a({ type: 'hello', code, role: 'player' });
    await b({ type: 'hello', code, role: 'player' });
    await a({ type: 'join', contestantId: `p${p[0].id}` });
    await b({ type: 'join', contestantId: `p${p[1].id}` });
    await tv({ type: 'action', game: 'mjz', action: { type: 'start' } });
    await tv({ type: 'action', game: 'mjz', action: { type: 'startWriting' } });
    const letter = hub.rooms.getState<MjzState>(code)!.letter!;
    await a({ type: 'action', game: 'mjz', action: { type: 'write', answers: { jmeno: `${letter}ena`, zvire: `${letter}ex` } } });
    await b({ type: 'action', game: 'mjz', action: { type: 'write', answers: { jmeno: `${letter}ena` } } });
    await a({ type: 'action', game: 'mjz', action: { type: 'done' } });
    await b({ type: 'action', game: 'mjz', action: { type: 'done' } });
    expect(hub.rooms.getState<MjzState>(code)!.phase).toBe('review');
    await tv({ type: 'action', game: 'mjz', action: { type: 'next' } });
    await tv({ type: 'action', game: 'mjz', action: { type: 'next' } });
    expect(hub.rooms.getState<MjzState>(code)!.phase).toBe('finished');

    expect((await matchRow(code))!.status).toBe('finished');
    const seats = await listParticipants(row!.id);
    // A: shared name 5 + only animal 20 = 25; B: shared name 5.
    expect(seats.map((s) => [s.player_id, s.place, Number(s.score)]).sort()).toEqual(
      [
        [p[0].id, 1, 25],
        [p[1].id, 2, 5],
      ].sort(),
    );
  });
});

describe('migration 002_more_game_types', () => {
  it('can run twice and allows the new game types only', async () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '002_more_game_types.sql'), 'utf8');
    await query(sql);
    await query(sql);
    for (const t of ['aktivity', 'mjz']) {
      const r = await one<{ id: number }>(`INSERT INTO matches (household_id, game_type) VALUES ($1, $2) RETURNING id`, [home.id, t]);
      expect(r?.id).toBeTruthy();
    }
    await expect(query(`INSERT INTO matches (household_id, game_type) VALUES ($1, 'golf')`, [home.id])).rejects.toThrow(/check/i);
    await expect(query(`INSERT INTO ratings (player_id, game_type, mu, sigma) VALUES ($1, 'golf', 25, 8)`, [p[0].id])).rejects.toThrow(/check/i);
  });
});
