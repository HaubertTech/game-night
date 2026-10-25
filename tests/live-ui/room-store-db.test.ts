import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiveGame, stepTurn, type LiveState } from '#lib/engine/live.ts';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '#lib/live/protocol.ts';
import { one, query } from '#lib/server/db.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { listParticipants } from '#lib/server/repo/matches.ts';
import { createPlayer, type Player } from '#lib/server/repo/players.ts';
import { DbRoomStore, liveRecordInput, parseContestantId, playerContestantId, STALE_ROOM_MS } from '#lib/server/room-store-db.ts';
import { RoomManager, type Scheduler } from '#lib/server/rooms.ts';
import { cleanup, makeHousehold } from '../server/helpers.ts';
import { makePool } from '../live/helpers.ts';

const v = PROTOCOL_VERSION;
type Outgoing = ClientMessage extends infer M ? (M extends unknown ? Omit<M, 'v'> : never) : never;
const pool = makePool({ hospoda: 'choice', lavice: 'estimate' }, ['priroda', 'dejiny'], 4);
const noTimers: Scheduler = { set: () => 0, clear: () => undefined };

let home: Household;
let tata: Player;
let anna: Player;

beforeAll(async () => {
  home = await makeHousehold('live-store');
  tata = await createPlayer(home.id, { name: 'Táta', level: 'hospoda' });
  anna = await createPlayer(home.id, { name: 'Anna', level: 'lavice' });
});
afterAll(() => cleanup([home]));

function contestants() {
  return [tata, anna].map((p) => ({
    id: playerContestantId(p.id),
    name: p.name,
    avatar: p.avatar,
    level: p.level,
    memberIds: [String(p.id)],
  }));
}

function manager(store: DbRoomStore, clock = () => Date.now()) {
  const inbox = new Map<string, ServerMessage[]>();
  const m = new RoomManager({ store, clock, scheduler: noTimers, send: (id, msg) => inbox.set(id, [...(inbox.get(id) ?? []), msg]) });
  const say = (client: string, msg: Outgoing) => m.handle(client, { v, ...msg } as ClientMessage);
  return { m, say, inbox };
}

async function row(code: string) {
  return one<{ id: number; status: string; mode: string; game_type: string; state: { code: string; state: LiveState } }>(
    `SELECT id, status, mode, game_type, state FROM matches WHERE room_code = $1 ORDER BY id DESC LIMIT 1`,
    [code],
  );
}

describe('DbRoomStore', () => {
  it('maps contestant ids to DB ids', () => {
    expect(parseContestantId('p12')).toEqual({ kind: 'player', id: 12 });
    expect(parseContestantId('t3')).toEqual({ kind: 'team', id: 3 });
    expect(parseContestantId('tata')).toBeNull();
  });

  it('creates a live quiz match, keeps its state and restores the room after a restart', async () => {
    const store = new DbRoomStore();
    const { m, say } = manager(store);
    const { code, hostToken } = await m.createRoom(
      { seed: 7, themes: ['priroda'], questionsPerContestant: 1, timerSeconds: null, contestants: contestants() },
      pool,
      {},
      { householdId: home.id },
    );
    let r = await row(code);
    expect(r).toMatchObject({ status: 'lobby', mode: 'live', game_type: 'quiz' });
    expect(r!.state.code).toBe(code);

    m.connect('tv');
    await say('tv', { type: 'hello', code, role: 'host', token: hostToken });
    await say('tv', { type: 'action', action: { type: 'start' } });
    r = await row(code);
    expect(r!.status).toBe('running');
    expect(r!.state.state.phase).toBe('roundIntro');

    // A fresh process sees the same room with the host token still valid.
    const restarted = manager(new DbRoomStore());
    expect(await restarted.m.restore()).toBeGreaterThanOrEqual(1);
    expect(restarted.m.getState(code)?.phase).toBe('roundIntro');
    restarted.m.connect('tv2');
    await restarted.say('tv2', { type: 'hello', code, role: 'host', token: hostToken });
    expect(restarted.inbox.get('tv2')?.some((x) => x.type === 'welcome')).toBe(true);
    m.dispose();
    restarted.m.dispose();
  });

  it('records the finished game once: participants, answers and seen questions', async () => {
    const store = new DbRoomStore();
    const { m, say } = manager(store);
    const { code, hostToken } = await m.createRoom(
      { seed: 11, themes: ['priroda', 'dejiny'], questionsPerContestant: 1, timerSeconds: null, contestants: contestants() },
      pool,
      {},
      { householdId: home.id },
    );
    m.connect('tv');
    m.connect('p1');
    m.connect('p2');
    await say('tv', { type: 'hello', code, role: 'host', token: hostToken });
    await say('p1', { type: 'hello', code, role: 'player' });
    await say('p2', { type: 'hello', code, role: 'player' });
    await say('p1', { type: 'join', contestantId: playerContestantId(tata.id) });
    await say('p2', { type: 'join', contestantId: playerContestantId(anna.id) });
    await say('tv', { type: 'action', action: { type: 'start' } });

    for (let round = 0; round < 2; round++) {
      await say('tv', { type: 'action', action: { type: 'startRound' } });
      const s = m.getState(code)!;
      const tq = s.questions[stepTurn(s, playerContestantId(tata.id))!.turn.questionId];
      await say('p1', { type: 'action', action: { type: 'answer', value: tq.type === 'choice' ? tq.answer : 0 } });
      await say('p2', { type: 'action', action: { type: 'answer', value: 100 } });
      expect(m.getState(code)!.phase).toBe('reveal');
      await say('tv', { type: 'action', action: { type: 'next' } }); // → roundEnd
      await say('tv', { type: 'action', action: { type: 'next' } }); // → next round / finished
    }
    expect(m.getState(code)!.phase).toBe('finished');

    const r = await row(code);
    expect(r!.status).toBe('finished');
    const participants = await listParticipants(r!.id);
    expect(participants.map((p) => p.player_id).sort()).toEqual([tata.id, anna.id].sort());
    expect(participants.find((p) => p.player_id === tata.id)).toMatchObject({ place: 1, score: 2 });
    const answers = await query<{ n: number }>('SELECT count(*)::int AS n FROM quiz_answers WHERE match_id = $1', [r!.id]);
    expect(answers[0].n).toBe(4);
    const seen = await query<{ n: number }>('SELECT count(*)::int AS n FROM seen_questions WHERE player_id = $1', [tata.id]);
    expect(seen[0].n).toBe(2);

    // Saving again (a phone leaving after the end) neither reopens nor records twice.
    await say('p1', { type: 'leave' });
    expect((await row(code))!.status).toBe('finished');
    expect(await listParticipants(r!.id)).toHaveLength(2);
    m.dispose();
  });

  it('abandons stale rooms instead of restoring them', async () => {
    const store = new DbRoomStore();
    const { m } = manager(store, () => Date.now() - STALE_ROOM_MS - 60_000);
    const { code } = await m.createRoom(
      { seed: 3, themes: ['priroda'], questionsPerContestant: 1, timerSeconds: null, contestants: contestants() },
      pool,
      {},
      { householdId: home.id },
    );
    const rooms = await new DbRoomStore().list();
    expect(rooms.map((x) => x.code)).not.toContain(code);
    expect((await row(code))!.status).toBe('abandoned');
    m.dispose();
  });

  it('refuses to create a room without a household', async () => {
    const { m } = manager(new DbRoomStore());
    await expect(
      m.createRoom({ seed: 1, themes: ['priroda'], questionsPerContestant: 1, timerSeconds: null, contestants: contestants() }, pool),
    ).rejects.toThrow(/household/);
  });

  it('builds recordMatch input with shared places and without kicked contestants', () => {
    const extra = { id: 'p999999', name: 'Host', avatar: '🙂', level: 'hospoda' as const, memberIds: ['999999'] };
    const state = createLiveGame(
      { seed: 5, themes: ['priroda'], questionsPerContestant: 1, timerSeconds: null, contestants: [...contestants(), extra] },
      pool,
    );
    const input = liveRecordInput(42, { ...state, kicked: ['p999999'] }, '2026-10-25T10:00:00Z');
    expect(input).toMatchObject({ matchId: 42, gameType: 'quiz', answers: [] });
    expect(input.participants.map((p) => [p.playerId, p.place])).toEqual([
      [tata.id, 1],
      [anna.id, 1],
    ]);
  });
});
