// POST /api/rooms for „Řekni, ukaž, nakresli“, „Město, jméno, zvíře“, chess and the digital card
// games with the DB room store: teams from players, the finished game recorded (game_type, seats,
// seen word cards, card rounds, ratings), and migration 004 (game types) applied twice.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AktivityState } from '#lib/games/aktivity/engine.ts';
import type { AktivityCard } from '#lib/games/aktivity/types.ts';
import type { ChessState } from '#lib/games/chess/engine.ts';
import { choosePrsiMove } from '#lib/games/karty-hra/ai/prsi-ai.ts';
import { chooseZolikyCommand } from '#lib/games/karty-hra/ai/zoliky-ai.ts';
import type { MjzState } from '#lib/games/mjz/engine.ts';
import { adviseClovece } from '#lib/games/clovece/ai.ts';
import type { CloveceRoomState, PrsiRoomState, ZolikyRoomState } from '#lib/live/table-games.ts';
import { getCardMatch } from '#lib/server/services/cards.ts';
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
/** Timers fire only when a test runs them (computer moves of the card rooms). */
const pendingTimers = new Map<number, () => void>();
let timerSeq = 0;
const manualTimers: Scheduler = {
  set: (fn) => {
    pendingTimers.set(++timerSeq, fn);
    return timerSeq;
  },
  clear: (handle) => void pendingTimers.delete(handle as number),
};
function runTimers() {
  const due = [...pendingTimers.values()];
  pendingTimers.clear();
  for (const fn of due) fn();
}
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
  hub = createLiveHub({ store: new DbRoomStore(), scheduler: manualTimers, loadAktivityCards: () => cards });
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

describe('POST /api/rooms: chess', () => {
  it('validates the two sides and the clock', async () => {
    const same = await httpError(() => postRoom(fakeEvent({ body: { game: 'chess', white_id: p[0].id, black_id: p[0].id }, household: home })));
    expect(same.status).toBe(400);
    const clock = await httpError(() => postRoom(fakeEvent({ body: { game: 'chess', white_id: p[0].id, black_id: p[1].id, minutes: 7 }, household: home })));
    expect(clock.status).toBe(400);
  });

  it('plays the scholar mate on two phones and records the league result', async () => {
    const { code, host_token: token, game } = await create({ game: 'chess', white_id: p[0].id, black_id: p[2].id, minutes: 10 });
    expect(game).toBe('chess');
    const row = await matchRow(code);
    expect(row).toMatchObject({ status: 'lobby', game_type: 'chess' });
    const info = await (await getRoom(fakeEvent({ params: { code } }))).json();
    expect(info).toMatchObject({ game: 'chess', phase: 'lobby' });
    expect(info.contestants.map((c: { id: string; name: string }) => c.name)).toEqual(['Táta', 'Anna']);

    const tv = client();
    const w = client();
    const b = client();
    await tv({ type: 'hello', code, role: 'host', token });
    await w({ type: 'hello', code, role: 'player' });
    await w({ type: 'join', contestantId: `p${p[0].id}` });
    await b({ type: 'hello', code, role: 'player' });
    await b({ type: 'join', contestantId: `p${p[2].id}` });
    for (const [i, uci] of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'].entries()) {
      await (i % 2 ? b : w)({ type: 'action', game: 'chess', action: { type: 'move', uci } });
    }
    expect(hub.rooms.getState<ChessState>(code)!.result?.reason).toBe('checkmate');
    expect((await matchRow(code))!.status).toBe('finished');
    const seats = await listParticipants(row!.id);
    expect(seats.map((s) => [s.player_id, s.place, Number(s.score)]).sort()).toEqual(
      [
        [p[0].id, 1, 1],
        [p[2].id, 2, 0],
      ].sort(),
    );
    const ratings = await query<{ game_type: string }>('SELECT game_type FROM ratings WHERE player_id = $1', [p[2].id]);
    expect(ratings.map((r) => r.game_type)).toContain('chess');
  });
});

describe('POST /api/rooms: digital prší and žolíky', () => {
  it('validates the table', async () => {
    const lonely = await httpError(() => postRoom(fakeEvent({ body: { game: 'prsi-hra', player_ids: [p[0].id] }, household: home })));
    expect(lonely.message).toMatch(/2 až 5/);
    const crowd = await httpError(() => postRoom(fakeEvent({ body: { game: 'zoliky-hra', player_ids: [p[0].id, p[1].id], computers: 4 }, household: home })));
    expect(crowd.status).toBe(400);
    const level = await httpError(() => postRoom(fakeEvent({ body: { game: 'prsi-hra', player_ids: [p[0].id], computers: 1, computer_level: 9 }, household: home })));
    expect(level.status).toBe(400);
  });

  it('plays prší with computers in the seats list and records the people as prsi', async () => {
    process.env.CARD_AI_DELAY_MS = '0';
    const { code, host_token: token } = await create({ game: 'prsi-hra', player_ids: [p[0].id, p[1].id], computers: 1, hints_for: [p[1].id] });
    delete process.env.CARD_AI_DELAY_MS;
    const row = await matchRow(code);
    expect(row).toMatchObject({ status: 'lobby', game_type: 'prsi' });
    // A live room is not a paper score sheet.
    expect(await getCardMatch(home.id, row!.id)).toBeNull();
    const state = hub.rooms.getState<PrsiRoomState>(code)!;
    expect(state.seats.map((s) => [s.ai, s.hints])).toEqual([
      [null, false],
      [null, true],
      [2, false],
    ]);
    const tv = client();
    const a = client();
    const b = client();
    await tv({ type: 'hello', code, role: 'host', token });
    await a({ type: 'hello', code, role: 'player' });
    await a({ type: 'join', contestantId: `p${p[0].id}` });
    await b({ type: 'hello', code, role: 'player' });
    await b({ type: 'join', contestantId: `p${p[1].id}` });
    await tv({ type: 'action', game: 'prsi-hra', action: { type: 'start' } });
    for (let i = 0; i < 3000; i++) {
      const room = hub.rooms.getState<PrsiRoomState>(code)!;
      if (room.table.phase === 'finished') break;
      const turn = room.table.turn;
      if (turn === 'ai1') {
        runTimers();
        await hub.rooms.flush();
        continue;
      }
      const send = turn === `p${p[0].id}` ? a : b;
      await send({ type: 'action', game: 'prsi-hra', action: choosePrsiMove(room.table, turn, 2).move });
    }
    const room = hub.rooms.getState<PrsiRoomState>(code)!;
    expect(room.table.phase).toBe('finished');
    expect((await matchRow(code))!.status).toBe('finished');
    const seats = await listParticipants(row!.id);
    expect(seats.map((s) => s.player_id).sort()).toEqual([p[0].id, p[1].id].sort());
    const order = room.table.sheet.deals[0].order;
    for (const s of seats) expect(s.place).toBe(order.indexOf(`p${s.player_id}`) + 1);
  });

  it('plays one round of žolíky and records card rounds', async () => {
    const { code, host_token: token } = await create({ game: 'zoliky-hra', player_ids: [p[2].id, p[3].id], rounds: 1 });
    const row = await matchRow(code);
    expect(row).toMatchObject({ status: 'lobby', game_type: 'zoliky' });
    const tv = client();
    const a = client();
    const b = client();
    await tv({ type: 'hello', code, role: 'host', token });
    await a({ type: 'hello', code, role: 'player' });
    await a({ type: 'join', contestantId: `p${p[2].id}` });
    await b({ type: 'hello', code, role: 'player' });
    await b({ type: 'join', contestantId: `p${p[3].id}` });
    await tv({ type: 'action', game: 'zoliky-hra', action: { type: 'start' } });
    for (let i = 0; i < 20000; i++) {
      const room = hub.rooms.getState<ZolikyRoomState>(code)!;
      if (room.table.phase !== 'playing') break;
      const turn = room.table.turn;
      await (turn === `p${p[2].id}` ? a : b)({ type: 'action', game: 'zoliky-hra', action: chooseZolikyCommand(room.table, turn, 2).command });
    }
    const room = hub.rooms.getState<ZolikyRoomState>(code)!;
    expect(room.table.phase).toBe('finished');
    expect((await matchRow(code))!.status).toBe('finished');
    const rounds = await query<{ player_id: number; round_no: number; points: number }>(
      'SELECT player_id, round_no, points FROM card_rounds WHERE match_id = $1 ORDER BY player_id',
      [row!.id],
    );
    expect(rounds.map((r) => [Number(r.player_id), r.round_no, r.points])).toEqual(
      [p[2], p[3]].map((x) => [x.id, 1, room.table.lastRound!.points[`p${x.id}`]]).sort((x, y) => x[0] - y[0]),
    );
  });
});

describe('POST /api/rooms: Člověče, nezlob se', () => {
  it('validates the table and the variants', async () => {
    const lonely = await httpError(() => postRoom(fakeEvent({ body: { game: 'clovece', player_ids: [p[0].id] }, household: home })));
    expect(lonely.message).toMatch(/2 až 4/);
    const crowd = await httpError(() => postRoom(fakeEvent({ body: { game: 'clovece', player_ids: [p[0].id, p[1].id], computers: 3 }, household: home })));
    expect(crowd.status).toBe(400);
    const pawns = await httpError(() => postRoom(fakeEvent({ body: { game: 'clovece', player_ids: [p[0].id], computers: 1, pawns: 3 }, household: home })));
    expect(pawns.status).toBe(400);
    const flag = await httpError(() => postRoom(fakeEvent({ body: { game: 'clovece', player_ids: [p[0].id], computers: 1, capture: 'ne' }, household: home })));
    expect(flag.status).toBe(400);
    const stranger = await httpError(() => postRoom(fakeEvent({ body: { game: 'clovece', player_ids: [p[0].id], computers: 1, on_tv: [p[1].id] }, household: home })));
    expect(stranger.message).toMatch(/na TV/i);
  });

  it('marks players without a phone as TV seats', async () => {
    const { code } = await create({ game: 'clovece', player_ids: [p[0].id, p[2].id], on_tv: [p[2].id] });
    const state = hub.rooms.getState<CloveceRoomState>(code)!;
    expect(state.seats.map((s) => [s.id, s.onTv])).toEqual([
      [`p${p[0].id}`, false],
      [`p${p[2].id}`, true],
    ]);
    expect(hub.rooms.seats(code).map((s) => s.joinable)).toEqual([true, false]);
  });

  it('plays with a computer and records the people as clovece', async () => {
    process.env.CARD_AI_DELAY_MS = '0';
    const { code, host_token: token } = await create({ game: 'clovece', player_ids: [p[0].id, p[2].id], computers: 1, computer_level: 3, hints_for: [p[2].id], pawns: 2, capture: false });
    delete process.env.CARD_AI_DELAY_MS;
    const row = await matchRow(code);
    expect(row).toMatchObject({ status: 'lobby', game_type: 'clovece' });
    const info = await (await getRoom(fakeEvent({ params: { code } }))).json();
    expect(info.contestants.map((c: { id: string }) => c.id)).toEqual([`p${p[0].id}`, `p${p[2].id}`]);
    const state = hub.rooms.getState<CloveceRoomState>(code)!;
    expect(state.table.settings).toMatchObject({ pawns: 2, capture: false });
    const tv = client();
    const a = client();
    const b = client();
    await tv({ type: 'hello', code, role: 'host', token });
    await a({ type: 'hello', code, role: 'player' });
    await a({ type: 'join', contestantId: `p${p[0].id}` });
    await b({ type: 'hello', code, role: 'player' });
    await b({ type: 'join', contestantId: `p${p[2].id}` });
    await tv({ type: 'action', game: 'clovece', action: { type: 'start' } });
    expect((await matchRow(code))!.status).toBe('running');
    for (let i = 0; i < 20000; i++) {
      const room = hub.rooms.getState<CloveceRoomState>(code)!;
      if (room.table.phase === 'finished') break;
      const turn = room.table.turn;
      if (turn === 'ai1') {
        runTimers();
        await hub.rooms.flush();
        continue;
      }
      await (turn === `p${p[0].id}` ? a : b)({ type: 'action', game: 'clovece', action: adviseClovece(room.table, 2).command });
    }
    const room = hub.rooms.getState<CloveceRoomState>(code)!;
    expect(room.table.phase).toBe('finished');
    expect((await matchRow(code))!.status).toBe('finished');
    const seats = await listParticipants(row!.id);
    expect(seats.map((s) => s.player_id).sort()).toEqual([p[0].id, p[2].id].sort());
    for (const s of seats) expect(s.place).toBe(room.table.finished.indexOf(`p${s.player_id}`) + 1);
    const rating = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ratings WHERE game_type = 'clovece' AND player_id = $1`, [p[0].id]);
    expect(rating?.n).toBe(1);
   }, 60_000);
});

describe('migration 006_clovece_game_type (latest game types)', () => {
  it('can run twice and allows the known game types only', async () => {
    // Older game-type migrations cannot run again once newer game types exist; 006 carries the full list.
    const sql = readFileSync(join(MIGRATIONS_DIR, '006_clovece_game_type.sql'), 'utf8');
    await query(sql);
    await query(sql);
    for (const t of ['aktivity', 'mjz', 'chess', 'clovece']) {
      const r = await one<{ id: number }>(`INSERT INTO matches (household_id, game_type) VALUES ($1, $2) RETURNING id`, [home.id, t]);
      expect(r?.id).toBeTruthy();
    }
    await expect(query(`INSERT INTO matches (household_id, game_type) VALUES ($1, 'golf')`, [home.id])).rejects.toThrow(/check/i);
    await expect(query(`INSERT INTO ratings (player_id, game_type, mu, sigma) VALUES ($1, 'golf', 25, 8)`, [p[0].id])).rejects.toThrow(/check/i);
  });
});
