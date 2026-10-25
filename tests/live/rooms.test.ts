import { describe, expect, it } from 'vitest';
import { stepTurn } from '../../src/lib/engine/live.ts';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '../../src/lib/live/protocol.ts';
import { CODE_ALPHABET, MemoryRoomStore, RoomManager, type Scheduler } from '../../src/lib/server/rooms.ts';
import { makePool, players } from './helpers.ts';

const v = PROTOCOL_VERSION;
/** ClientMessage without `v`, distributed over the union. */
type Outgoing = ClientMessage extends infer M ? (M extends unknown ? Omit<M, 'v'> : never) : never;
const pool = makePool({ hospoda: 'choice', lavice: 'choice', piskoviste: 'choice' });

class FakeTime implements Scheduler {
  now = 1_000_000;
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
      send: (m: Outgoing) => manager.handle(id, { v, ...m } as ClientMessage),
      all: () => inbox.get(id) ?? [],
      last: <T extends ServerMessage['type']>(type: T) =>
        (inbox.get(id) ?? []).filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1),
    };
  };
  return { manager, store, time, client };
}

async function room(s: ReturnType<typeof setup>, timerSeconds: number | null = 20) {
  return s.manager.createRoom(
    { seed: 3, themes: ['priroda'], questionsPerContestant: 1, timerSeconds, contestants: players },
    pool,
  );
}

describe('rooms', () => {
  it('creates a 4-character code without look-alike characters and stores the room', async () => {
    const s = setup();
    const { code, hostToken } = await room(s);
    expect(code).toHaveLength(4);
    expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
    expect(hostToken).toBeTruthy();
    const stored = await s.store.load(code);
    expect(stored?.state.phase).toBe('lobby');
    expect(JSON.stringify(stored)).not.toContain(hostToken);
  });

  it('rejects a host with a wrong token and an unknown room', async () => {
    const s = setup();
    const { code } = await room(s);
    const tv = s.client('tv');
    await tv.send({ type: 'hello', code, role: 'host', token: 'nope' });
    expect(tv.last('error')?.code).toBe('forbidden');
    await tv.send({ type: 'hello', code: 'ZZZZ', role: 'host', token: 'nope' });
    expect(tv.last('error')?.code).toBe('roomNotFound');
  });

  it('joins phones, broadcasts views and protects claimed contestants', async () => {
    const s = setup();
    const { code, hostToken } = await room(s);
    const tv = s.client('tv');
    const phone = s.client('p1');
    const other = s.client('p2');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await phone.send({ type: 'hello', code, role: 'player' });
    await other.send({ type: 'hello', code, role: 'player' });
    expect(phone.last('welcome')?.contestantId).toBeNull();
    expect(phone.last('state')?.view.viewer).toBe('spectator');

    await phone.send({ type: 'join', contestantId: 'tata' });
    expect(phone.last('state')?.view.me).toBe('tata');
    expect(tv.last('state')?.presence.tata).toEqual({ claimed: true, online: true });

    await other.send({ type: 'join', contestantId: 'tata' });
    expect(other.last('error')?.code).toBe('taken');
    await other.send({ type: 'join', contestantId: 'kuba' });
    expect(other.last('error')?.code).toBe('forbidden'); // plays on the TV
  });

  it('reconnects a phone with its token to the same contestant', async () => {
    const s = setup();
    const { code } = await room(s);
    const phone = s.client('p1');
    await phone.send({ type: 'hello', code, role: 'player' });
    const token = phone.last('welcome')!.token;
    await phone.send({ type: 'join', contestantId: 'anicka' });
    await s.manager.disconnect('p1');

    const tv = s.client('tv-watch');
    await tv.send({ type: 'hello', code, role: 'player' });
    expect(tv.last('state')?.presence.anicka).toEqual({ claimed: true, online: false });

    const again = s.client('p1-again');
    await again.send({ type: 'hello', code, role: 'player', token });
    expect(again.last('welcome')?.contestantId).toBe('anicka');
    expect(again.last('state')?.view.me).toBe('anicka');
  });

  it('restores rooms from the store after a restart, with the timer re-armed', async () => {
    const store = new MemoryRoomStore();
    const time = new FakeTime();
    const first = setup(store, time);
    const { code, hostToken } = await room(first);
    const tv = first.client('tv');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await tv.send({ type: 'action', action: { type: 'start' } });
    await tv.send({ type: 'action', action: { type: 'startRound' } });
    first.manager.dispose();

    const second = setup(store, time);
    expect(await second.manager.restore()).toBe(1);
    expect(second.manager.getState(code)?.phase).toBe('asking');
    time.advance(20_000);
    await second.manager.flush();
    expect(second.manager.getState(code)?.stage).toBe('tv');
  });

  it('applies actions with the client as author and refuses foreign ones', async () => {
    const s = setup();
    const { code, hostToken } = await room(s);
    const tv = s.client('tv');
    const phone = s.client('p1');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await phone.send({ type: 'hello', code, role: 'player' });
    await phone.send({ type: 'action', action: { type: 'start' } });
    expect(phone.last('error')?.code).toBe('notJoined');
    await phone.send({ type: 'join', contestantId: 'tata' });
    await phone.send({ type: 'action', action: { type: 'start' } });
    expect(phone.last('error')?.code).toBe('forbidden');

    await tv.send({ type: 'action', action: { type: 'start' } });
    await tv.send({ type: 'action', action: { type: 'startRound' } });
    const view = phone.last('state')!.view;
    expect(view.phase).toBe('asking');
    expect(view.question).not.toBeNull();
    const state = s.manager.getState(code)!;
    const q = state.questions[stepTurn(state, 'tata')!.turn.questionId];
    await phone.send({ type: 'action', action: { type: 'answer', value: q.type === 'choice' ? q.answer : 0 } });
    expect(tv.last('state')?.view.contestants.find((c) => c.id === 'tata')?.answered).toBe(true);
    expect((await s.store.load(code))?.state.pending.tata).toBeDefined();
  });

  it('times out the phones through the scheduler and the fake clock', async () => {
    const s = setup();
    const { code, hostToken } = await room(s);
    const tv = s.client('tv');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await tv.send({ type: 'action', action: { type: 'start' } });
    await tv.send({ type: 'action', action: { type: 'startRound' } });
    expect(s.time.pending()).toBe(1);
    s.time.advance(19_999);
    await s.manager.flush();
    expect(s.manager.getState(code)?.stage).toBe('phones');
    s.time.advance(1);
    await s.manager.flush();
    const state = s.manager.getState(code)!;
    expect(state.stage).toBe('tv'); // kuba on TV, no timer for preschool
    expect(state.pending.tata?.timedOut).toBe(true);
    expect(s.time.pending()).toBe(0);
    expect(tv.last('state')?.view.stage).toBe('tv');
  });

  it('kick releases the phone and tells it', async () => {
    const s = setup();
    const { code, hostToken } = await room(s);
    const tv = s.client('tv');
    const phone = s.client('p1');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await phone.send({ type: 'hello', code, role: 'player' });
    await phone.send({ type: 'join', contestantId: 'anicka' });
    await tv.send({ type: 'action', action: { type: 'kick', contestantId: 'anicka' } });
    expect(phone.all().some((m) => m.type === 'error' && m.code === 'kicked')).toBe(true);
    expect(phone.last('state')?.view.me).toBeNull();
    expect(s.manager.getRoom(code)?.claims.anicka).toBeUndefined();
    await phone.send({ type: 'join', contestantId: 'anicka' });
    expect(phone.last('error')?.code).toBe('kicked');
  });

  it('answers ping and rejects actions before hello', async () => {
    const s = setup();
    const c = s.client('c');
    await c.send({ type: 'ping', t: 5 });
    expect(c.last('pong')?.t).toBe(5);
    await c.send({ type: 'action', action: { type: 'start' } });
    expect(c.last('error')?.code).toBe('notHello');
  });
});
