// Člověče, nezlob se in a live room: seats for phones, the TV plays only for a seat without a phone, computers move through
// the scheduler, the owl's hint for children, a whole game and its league input.

import { describe, expect, it } from 'vitest';
import { adviseClovece } from '../../src/lib/games/clovece/ai.ts';
import type { CloveceState } from '../../src/lib/games/clovece/engine.ts';
import { parseClientMessage, PROTOCOL_VERSION, type ClientMessage, type GameStateMessage, type ServerMessage } from '../../src/lib/live/protocol.ts';
import type { CloveceRoomState, CloveceRoomView, TableSeat } from '../../src/lib/live/table-games.ts';
import { cloveceRecordInput, cloveceRoomAdapter, createCloveceRoom } from '../../src/lib/server/games/clovece.ts';
import { MemoryRoomStore, RoomManager, type Scheduler } from '../../src/lib/server/rooms.ts';

const v = PROTOCOL_VERSION;
type Outgoing = ClientMessage extends infer M ? (M extends unknown ? Omit<M, 'v'> : never) : never;

class FakeTime implements Scheduler {
  now = 5_000_000;
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
  advance(ms: number) {
    this.now += ms;
    const due = this.tasks.filter((t) => t.at <= this.now);
    this.tasks = this.tasks.filter((t) => t.at > this.now);
    for (const t of due) t.fn();
  }
}

function setup() {
  const time = new FakeTime();
  const inbox = new Map<string, ServerMessage[]>();
  let n = 0;
  const manager = new RoomManager({
    store: new MemoryRoomStore(),
    clock: time.clock,
    scheduler: time,
    send: (id, msg) => inbox.set(id, [...(inbox.get(id) ?? []), msg]),
    random: () => (n++ * 0.37) % 1,
    newToken: () => `token-${++n}`,
  });
  const client = (id: string) => {
    manager.connect(id);
    return {
      send: async (m: Outgoing) => {
        await manager.handle(id, { v, ...m } as ClientMessage);
        await manager.flush();
      },
      last: <T extends ServerMessage['type']>(type: T) =>
        (inbox.get(id) ?? []).filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1),
      view: () => ((inbox.get(id) ?? []).filter((m): m is GameStateMessage => m.type === 'gameState').at(-1)?.view ?? null) as CloveceRoomView | null,
    };
  };
  return { manager, time, client };
}

const seat = (id: string, name: string, ai: 1 | 2 | 3 | null = null, hints = false): TableSeat => ({ id, name, avatar: '🐻', level: 'hospoda', ai, hints });

async function room(s: ReturnType<typeof setup>, seats: TableSeat[], settings = {}) {
  const { code, hostToken } = await s.manager.createGameRoom('clovece', (c, createdAt, now) =>
    createCloveceRoom({ id: `clovece-${c}`, createdAt, now, seed: 7, seats, aiDelayMs: 500, settings }),
  );
  const tv = s.client('tv');
  await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
  const phone = s.client('phone');
  await phone.send({ type: 'hello', code, role: 'player' });
  await phone.send({ type: 'join', contestantId: 'p1' });
  return { code, tv, phone };
}

describe('rooms: Člověče, nezlob se', () => {
  it('offers only people as seats and waits in the lobby for the host', async () => {
    const s = setup();
    const { code, tv, phone } = await room(s, [seat('p1', 'Táta', null, true), seat('ai1', 'Robík', 2)]);
    expect(s.manager.seats(code).map((x) => x.id)).toEqual(['p1']);
    expect(tv.view()).toMatchObject({ roomPhase: 'lobby', viewer: 'host', me: null });
    expect(phone.view()).toMatchObject({ me: 'p1', myColor: 'red' });
    expect(phone.view() && 'rng' in phone.view()!).toBe(false);
    await phone.send({ type: 'action', game: 'clovece', action: { type: 'roll' } });
    expect(phone.last('error')?.code).toBe('wrongPhase');
    await phone.send({ type: 'action', game: 'clovece', action: { type: 'start' } });
    expect(phone.last('error')?.code).toBe('forbidden');
    await tv.send({ type: 'action', game: 'clovece', action: { type: 'start' } });
    expect(tv.view()?.roomPhase).toBe('playing');
  });

  it('the TV may not roll for a player and nobody plays out of turn', async () => {
    const s = setup();
    const { tv, phone } = await room(s, [seat('ai1', 'Robík', 2), seat('p1', 'Táta')]);
    await tv.send({ type: 'action', game: 'clovece', action: { type: 'start' } });
    await tv.send({ type: 'action', game: 'clovece', action: { type: 'roll' } });
    expect(tv.last('error')?.code).toBe('forbidden');
    await phone.send({ type: 'action', game: 'clovece', action: { type: 'roll' } });
    expect(phone.last('error')?.code).toBe('notYourTurn');
  });

  it('the host rolls and moves for a player on the TV, only on that player\'s turn', async () => {
    const s = setup();
    const kid: TableSeat = { ...seat('p2', 'Bára', null, true), level: 'piskoviste', onTv: true };
    const { code, tv, phone } = await room(s, [kid, seat('p1', 'Táta')]);
    expect(s.manager.seats(code)).toEqual([
      { id: 'p2', joinable: false, kicked: false },
      { id: 'p1', joinable: true, kicked: false },
    ]);
    const other = s.client('phone2');
    await other.send({ type: 'hello', code, role: 'player' });
    await other.send({ type: 'join', contestantId: 'p2' });
    expect(other.last('error')?.code).toBe('forbidden');

    await tv.send({ type: 'action', game: 'clovece', action: { type: 'start' } });
    expect(tv.view()).toMatchObject({ turn: 'p2', hint: { text: 'Hoď kostkou.', pawn: null } });
    expect(phone.view()?.hint).toBeNull();
    for (let i = 0; i < 200 && s.manager.getState<CloveceRoomState>(code)!.table.turn === 'p2'; i++) {
      const st = s.manager.getState<CloveceRoomState>(code)!;
      await tv.send({ type: 'action', game: 'clovece', action: adviseClovece(st.table, 2).command });
      expect(tv.last('error')).toBeUndefined();
    }
    const st = s.manager.getState<CloveceRoomState>(code)!;
    expect(st.table.turn).toBe('p1');
    expect(st.table.seq).toBeGreaterThan(0);
    expect(tv.view()?.hint).toBeNull();
    await tv.send({ type: 'action', game: 'clovece', action: { type: 'roll' } });
    expect(tv.last('error')?.code).toBe('forbidden');
  });

  it('computers move after the pause and pass the turn to the phone', async () => {
    const s = setup();
    const { code, tv, phone } = await room(s, [seat('ai1', 'Robík', 2), seat('p1', 'Táta', null, true)]);
    await tv.send({ type: 'action', game: 'clovece', action: { type: 'start' } });
    for (let i = 0; i < 60 && s.manager.getState<CloveceRoomState>(code)!.table.turn === 'ai1'; i++) {
      s.time.advance(500);
      await s.manager.flush();
    }
    const view = phone.view()!;
    expect(view.turn).toBe('p1');
    expect(view.hint).toMatchObject({ text: 'Hoď kostkou.', pawn: null });
    await phone.send({ type: 'action', game: 'clovece', action: { type: 'roll' } });
    expect(phone.last('error')).toBeUndefined();
  });

  it('plays a whole game: the phone follows the advice, the league gets only the person', async () => {
    const s = setup();
    const { code, tv, phone } = await room(s, [seat('p1', 'Táta', null, true), seat('ai1', 'Robík', 1), seat('ai2', 'Pixel', 3)], { pawns: 2 });
    await tv.send({ type: 'action', game: 'clovece', action: { type: 'start' } });
    for (let i = 0; i < 20000; i++) {
      const st = s.manager.getState<CloveceRoomState>(code)!;
      if (st.table.phase === 'finished') break;
      if (st.table.turn === 'p1') {
        const advice = adviseClovece(st.table, 2);
        await phone.send({ type: 'action', game: 'clovece', action: advice.command });
      } else {
        s.time.advance(500);
        await s.manager.flush();
      }
    }
    const final = s.manager.getState<CloveceRoomState>(code)!;
    expect(final.table.phase).toBe('finished');
    expect(cloveceRoomAdapter.isFinished(final)).toBe(true);
    expect(tv.view()?.roomPhase).toBe('finished');
    const input = cloveceRecordInput(9, final, '2026-10-25T20:00:00.000Z');
    expect(input.gameType).toBe('clovece');
    expect(input.participants).toHaveLength(1);
    expect(input.participants[0]).toMatchObject({ participantId: 'p1', playerId: 1, place: final.table.finished.indexOf('p1') + 1 });
  });

  it('a person out of time gets a server move', async () => {
    const s = setup();
    const { code, tv } = await s.manager
      .createGameRoom('clovece', (c, createdAt, now) =>
        createCloveceRoom({ id: `clovece-${c}`, createdAt, now, seed: 3, seats: [seat('p1', 'Táta'), seat('p2', 'Máma')], aiDelayMs: 500, turnSeconds: 30 }),
      )
      .then(async (r) => {
        const host = s.client('tv');
        await host.send({ type: 'hello', code: r.code, role: 'host', token: r.hostToken });
        return { code: r.code, tv: host };
      });
    await tv.send({ type: 'action', game: 'clovece', action: { type: 'start' } });
    const before = s.manager.getState<CloveceRoomState>(code)!.table as CloveceState;
    expect(tv.view()?.deadline).toBe(s.time.now + 30_000);
    s.time.advance(30_000);
    await s.manager.flush();
    expect(s.manager.getState<CloveceRoomState>(code)!.table.seq).toBeGreaterThan(before.seq);
  });

  it('parses only valid commands', () => {
    const ok = (action: unknown) => parseClientMessage(JSON.stringify({ v, type: 'action', game: 'clovece', action })).ok;
    expect(ok({ type: 'roll' })).toBe(true);
    expect(ok({ type: 'move', pawn: 3 })).toBe(true);
    expect(ok({ type: 'move', pawn: 4 })).toBe(false);
    expect(ok({ type: 'move', pawn: '1' })).toBe(false);
    expect(ok({ type: 'nextDeal' })).toBe(false);
  });
});
