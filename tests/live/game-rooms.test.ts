// Live rooms hosting „Řekni, ukaž, nakresli“ and „Město, jméno, zvíře“ (protocol v2).

import { describe, expect, it } from 'vitest';
import { createAktivity, type AktivityState, type AktivityTeam } from '../../src/lib/games/aktivity/engine.ts';
import type { AktivityCard } from '../../src/lib/games/aktivity/types.ts';
import { createMjzGame, type MjzState } from '../../src/lib/games/mjz/engine.ts';
import {
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type GameStateMessage,
  type ServerMessage,
} from '../../src/lib/live/protocol.ts';
import { MemoryRoomStore, RoomManager, type Scheduler } from '../../src/lib/server/rooms.ts';

const v = PROTOCOL_VERSION;
type Outgoing = ClientMessage extends infer M ? (M extends unknown ? Omit<M, 'v'> : never) : never;

class FakeTime implements Scheduler {
  now = 2_000_000;
  private tasks: { at: number; fn: () => void; id: number }[] = [];
  private seq = 0;
  clock = () => this.now;
  set(fn: () => void, ms: number) {
    const id = ++this.seq;
    this.tasks.push({ at: this.now + ms, fn, id });
    return id;
  }
  clear(handle: unknown) {
    this.tasks = this.tasks.filter((t) => t.id !== handle);
  }
  pending() {
    return this.tasks.length;
  }
  advance(ms: number) {
    this.now += ms;
    const due = this.tasks.filter((t) => t.at <= this.now);
    this.tasks = this.tasks.filter((t) => t.at > this.now);
    for (const t of due) t.fn();
  }
}

function setup(store = new MemoryRoomStore(), time = new FakeTime()) {
  const inbox = new Map<string, ServerMessage[]>();
  let n = 0;
  const manager = new RoomManager({
    store,
    clock: time.clock,
    scheduler: time,
    send: (id, msg) => inbox.set(id, [...(inbox.get(id) ?? []), msg]),
    random: () => (n++ * 0.37) % 1,
    newToken: () => `token-${++n}`,
  });
  const client = (id: string) => {
    manager.connect(id);
    return {
      id,
      send: async (m: Outgoing) => {
        await manager.handle(id, { v, ...m } as ClientMessage);
        await manager.flush();
      },
      last: <T extends ServerMessage['type']>(type: T) =>
        (inbox.get(id) ?? []).filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1),
      game: () => (inbox.get(id) ?? []).filter((m): m is GameStateMessage => m.type === 'gameState').at(-1),
    };
  };
  return { manager, store, time, client };
}

// ---------- aktivity ----------

const cards: AktivityCard[] = (['hospoda', 'lavice'] as const).flatMap((level) =>
  Array.from({ length: 12 }, (_, i) => ({
    id: `${level}-${String(i + 1).padStart(3, '0')}`,
    level,
    word: `${level} slovo ${i + 1}`,
    mode: 'rekni' as const,
    difficulty: ([3, 4, 5] as const)[i % 3],
  })),
);
const teams: AktivityTeam[] = [
  { id: 't1', name: 'Modří', players: [{ id: 'p1', name: 'Táta', level: 'hospoda' }, { id: 'p2', name: 'Máma', level: 'hospoda' }] },
  { id: 't2', name: 'Červení', players: [{ id: 'p3', name: 'Anička', level: 'lavice' }, { id: 'p4', name: 'Petr', level: 'hospoda' }] },
];

async function aktivityRoom(s: ReturnType<typeof setup>) {
  return s.manager.createGameRoom('aktivity', (code, createdAt) =>
    createAktivity({ id: `aktivity-${code}`, createdAt, seed: 7, teams, timerSeconds: 30, goal: { kind: 'rounds', rounds: 1 } }, cards),
  );
}

describe('rooms: Řekni, ukaž, nakresli', () => {
  it('stores the game with the room and sends gameState views', async () => {
    const s = setup();
    const { code, hostToken } = await aktivityRoom(s);
    expect((await s.store.load(code))?.game).toBe('aktivity');
    const tv = s.client('tv');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    expect(tv.last('welcome')).toMatchObject({ role: 'host', game: 'aktivity' });
    expect(tv.game()).toMatchObject({ type: 'gameState', game: 'aktivity', view: { phase: 'setup', viewer: 'host' } });
    expect(tv.last('state')).toBeUndefined();
    expect(Object.keys(tv.game()!.presence).sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('lets phones claim players and shows the word only to the explainer', async () => {
    const s = setup();
    const { code, hostToken } = await aktivityRoom(s);
    const tv = s.client('tv');
    const tata = s.client('tata');
    const mama = s.client('mama');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    for (const [c, id] of [[tata, 'p1'], [mama, 'p2']] as const) {
      await c.send({ type: 'hello', code, role: 'player' });
      await c.send({ type: 'join', contestantId: id });
    }
    expect(tv.game()!.presence.p1).toEqual({ claimed: true, online: true });

    await tv.send({ type: 'action', game: 'aktivity', action: { type: 'start' } });
    expect(tata.game()!.view).toMatchObject({ phase: 'turnIntro', youExplain: true, me: 'p1' });
    await tata.send({ type: 'action', game: 'aktivity', action: { type: 'startTurn', difficulty: 4 } });

    const secret = tata.game()!;
    expect(secret.game === 'aktivity' && secret.view.secret?.word).toMatch(/hospoda slovo/);
    for (const c of [tv, mama]) {
      const m = c.game()!;
      expect(m.game === 'aktivity' && m.view.secret).toBeNull();
      expect(JSON.stringify(m.view)).not.toContain('hospoda slovo');
    }

    await tata.send({ type: 'action', game: 'aktivity', action: { type: 'guessed' } });
    const after = tv.game()!;
    expect(after.view.phase).toBe('result');
    expect(after.game === 'aktivity' && after.view.teams.find((t) => t.id === 't1')?.score).toBe(4);
  });

  it('refuses an action for another game and a quiz action without game', async () => {
    const s = setup();
    const { code, hostToken } = await aktivityRoom(s);
    const tv = s.client('tv');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await tv.send({ type: 'action', action: { type: 'start' } });
    expect(tv.last('error')?.code).toBe('wrongGame');
    await tv.send({ type: 'action', game: 'mjz', action: { type: 'start' } });
    expect(tv.last('error')?.code).toBe('wrongGame');
    expect(s.manager.getState<AktivityState>(code)?.phase).toBe('setup');
  });

  it('ends a turn through the scheduler when the time runs out', async () => {
    const s = setup();
    const { code, hostToken } = await aktivityRoom(s);
    const tv = s.client('tv');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await tv.send({ type: 'action', game: 'aktivity', action: { type: 'start' } });
    await tv.send({ type: 'action', game: 'aktivity', action: { type: 'startTurn', difficulty: 3 } });
    expect(s.time.pending()).toBe(1);
    s.time.advance(30_000);
    await s.manager.flush();
    const state = s.manager.getState<AktivityState>(code)!;
    expect(state.phase).toBe('result');
    expect(state.history[0].outcome).toBe('timeout');
  });

  it('restores an aktivity room and re-arms its timer', async () => {
    const store = new MemoryRoomStore();
    const time = new FakeTime();
    const first = setup(store, time);
    const { code, hostToken } = await aktivityRoom(first);
    const tv = first.client('tv');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await tv.send({ type: 'action', game: 'aktivity', action: { type: 'start' } });
    await tv.send({ type: 'action', game: 'aktivity', action: { type: 'startTurn', difficulty: 5 } });
    first.manager.dispose();

    const second = setup(store, time);
    expect(await second.manager.restore()).toBe(1);
    time.advance(31_000);
    await second.manager.flush();
    expect(second.manager.getState<AktivityState>(code)?.phase).toBe('result');
  });
});

// ---------- mjz ----------

const people = [
  { id: 'p1', name: 'Táta', avatar: '🐻', level: 'hospoda' as const, memberIds: ['1'] },
  { id: 'p2', name: 'Máma', avatar: '🦉', level: 'hospoda' as const, memberIds: ['2'] },
  { id: 'p3', name: 'Kuba', avatar: '🐸', level: 'piskoviste' as const, memberIds: ['3'] },
];

async function mjzRoom(s: ReturnType<typeof setup>) {
  return s.manager.createGameRoom('mjz', (code, createdAt) =>
    createMjzGame({
      id: `mjz-${code}`,
      createdAt,
      seed: 11,
      contestants: people,
      settings: { rounds: 1, timeSeconds: 60, categories: [{ id: 'mesto', label: 'Město', hints: ['mesta'] }, { id: 'zvire', label: 'Zvíře' }] },
    }),
  );
}

describe('rooms: Město, jméno, zvíře', () => {
  it('hides other sheets while writing and stops the round after Stop! through the scheduler', async () => {
    const s = setup();
    const { code, hostToken } = await mjzRoom(s);
    const tv = s.client('tv');
    const tata = s.client('tata');
    const mama = s.client('mama');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    for (const [c, id] of [[tata, 'p1'], [mama, 'p2']] as const) {
      await c.send({ type: 'hello', code, role: 'player' });
      await c.send({ type: 'join', contestantId: id });
    }
    await tv.send({ type: 'action', game: 'mjz', action: { type: 'start' } });
    await tv.send({ type: 'action', game: 'mjz', action: { type: 'startWriting' } });
    const letter = s.manager.getState<MjzState>(code)!.letter!;
    await tata.send({ type: 'action', game: 'mjz', action: { type: 'write', answers: { mesto: `${letter}město`, zvire: `${letter}zvíře` } } });
    // The host writes for the preschooler (assisted), not for an adult.
    await tv.send({ type: 'action', game: 'mjz', action: { type: 'write', answers: { zvire: `${letter}kuba` }, contestantId: 'p3' } });
    await tv.send({ type: 'action', game: 'mjz', action: { type: 'write', answers: { zvire: 'x' }, contestantId: 'p2' } });
    expect(tv.last('error')?.code).toBe('forbidden');

    const mamaView = mama.game()!;
    expect(JSON.stringify(mamaView.view)).not.toContain(`${letter}město`);
    const tvView = tv.game()!;
    expect(tvView.game === 'mjz' && tvView.view.contestants.find((c) => c.id === 'p1')?.filled).toBe(2);

    await tata.send({ type: 'action', game: 'mjz', action: { type: 'stop' } });
    expect(s.manager.getState<MjzState>(code)!.stoppedBy).toBe('p1');
    s.time.advance(10_000);
    await s.manager.flush();
    const state = s.manager.getState<MjzState>(code)!;
    expect(state.phase).toBe('review');

    const review = mama.game()!;
    expect(review.game === 'mjz' && review.view.answers?.some((a) => a.text === `${letter}město`)).toBe(true);
    await mama.send({ type: 'action', game: 'mjz', action: { type: 'challenge', contestantId: 'p1', categoryId: 'mesto' } });
    expect(s.manager.getState<MjzState>(code)!.challenges['p1|mesto']).toEqual({ by: 'p2', votes: { p2: false } });
    await tata.send({ type: 'action', game: 'mjz', action: { type: 'vote', contestantId: 'p1', categoryId: 'mesto', valid: true } });
    expect(tata.last('error')?.code).toBe('ownAnswer');
  });

  it('lets a phone claim any contestant and keeps a kicked one out', async () => {
    const s = setup();
    const { code, hostToken } = await mjzRoom(s);
    const tv = s.client('tv');
    const kid = s.client('kid');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await kid.send({ type: 'hello', code, role: 'player' });
    await kid.send({ type: 'join', contestantId: 'p3' });
    expect(kid.last('error')).toBeUndefined();
    await tv.send({ type: 'action', game: 'mjz', action: { type: 'kick', contestantId: 'p3' } });
    expect(kid.last('error')?.code).toBe('kicked');
    await kid.send({ type: 'join', contestantId: 'p3' });
    expect(kid.last('error')?.code).toBe('kicked');
    expect(s.manager.seats(code).find((x) => x.id === 'p3')?.kicked).toBe(true);
  });
});

// ---------- protocol ----------

describe('protocol v2', () => {
  it('still accepts version 1 quiz messages', () => {
    const r = parseClientMessage(JSON.stringify({ v: 1, type: 'action', action: { type: 'start' } }));
    expect(r).toEqual({ ok: true, message: { v: 1, type: 'action', action: { type: 'start' } } });
  });

  it('parses game actions and drops unknown fields', () => {
    const r = parseClientMessage(JSON.stringify({ v, type: 'action', game: 'aktivity', action: { type: 'startTurn', difficulty: 4, hack: 1 } }));
    expect(r).toEqual({ ok: true, message: { v, type: 'action', game: 'aktivity', action: { type: 'startTurn', difficulty: 4 } } });
    const w = parseClientMessage(JSON.stringify({ v, type: 'action', game: 'mjz', action: { type: 'write', answers: { mesto: 'Brno' } } }));
    expect(w.ok && w.message).toMatchObject({ game: 'mjz', action: { type: 'write', answers: { mesto: 'Brno' } } });
  });

  it('rejects invalid game actions, server-only timeouts and unknown games', () => {
    const bad = [
      { game: 'aktivity', action: { type: 'startTurn', difficulty: 7 } },
      { game: 'aktivity', action: { type: 'timeout' } },
      { game: 'mjz', action: { type: 'write', answers: { mesto: 5 } } },
      { game: 'mjz', action: { type: 'rule', contestantId: 'p1', categoryId: 'mesto', valid: 'yes' } },
      { game: 'mjz', action: { type: 'timeout' } },
      { game: 'chess', action: { type: 'start' } },
    ];
    for (const b of bad) expect(parseClientMessage(JSON.stringify({ v, type: 'action', ...b })).ok).toBe(false);
  });
});
