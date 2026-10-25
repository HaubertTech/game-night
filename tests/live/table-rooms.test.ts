// Live rooms hosting chess and the digital card games (prší, žolíky): seats, hidden hands,
// computer moves and time limits through the scheduler, and the league input of finished games.

import { describe, expect, it } from 'vitest';
import { createChessGame, type ChessState } from '../../src/lib/games/chess/engine.ts';
import { choosePrsiMove } from '../../src/lib/games/karty-hra/ai/prsi-ai.ts';
import { chooseZolikyCommand } from '../../src/lib/games/karty-hra/ai/zoliky-ai.ts';
import type { AiLevel } from '../../src/lib/games/karty-hra/prsi-engine.ts';
import { parseClientMessage, PROTOCOL_VERSION, type ClientMessage, type GameStateMessage, type ServerMessage } from '../../src/lib/live/protocol.ts';
import type { PrsiRoomState, PrsiRoomView, TableSeat, ZolikyRoomState } from '../../src/lib/live/table-games.ts';
import { chessAdapter, chessRecordInput } from '../../src/lib/server/games/chess.ts';
import { createPrsiRoom, prsiRecordInput, prsiRoomAdapter } from '../../src/lib/server/games/prsi-hra.ts';
import { createZolikyRoom, zolikyRecordInput, zolikyRoomAdapter } from '../../src/lib/server/games/zoliky-hra.ts';
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

async function tick(s: ReturnType<typeof setup>, ms: number) {
  s.time.advance(ms);
  await s.manager.flush();
}

// ---------- chess ----------

const white = { id: 'p1', name: 'Táta', avatar: '🐻', level: 'hospoda' as const };
const black = { id: 'p2', name: 'Anička', avatar: '🦊', level: 'lavice' as const };

async function chessRoom(s: ReturnType<typeof setup>, minutes = 0) {
  return s.manager.createGameRoom('chess', (code, createdAt) =>
    createChessGame({ id: `chess-${code}`, mode: 'room', createdAt, white, black, allowUndo: false, clock: minutes ? { minutes } : null }),
  );
}

async function chessTable(s: ReturnType<typeof setup>, minutes = 0) {
  const { code, hostToken } = await chessRoom(s, minutes);
  const tv = s.client('tv');
  const w = s.client('w');
  const b = s.client('b');
  await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
  await w.send({ type: 'hello', code, role: 'player' });
  await w.send({ type: 'join', contestantId: 'p1' });
  await b.send({ type: 'hello', code, role: 'player' });
  await b.send({ type: 'join', contestantId: 'p2' });
  return { code, tv, w, b };
}

describe('rooms: chess', () => {
  it('offers the two colours as seats and tells each phone its colour', async () => {
    const s = setup();
    const { code, tv, w, b } = await chessTable(s);
    expect(s.manager.seats(code).map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(tv.game()).toMatchObject({ game: 'chess', view: { viewer: 'host', color: null, phase: 'lobby' } });
    expect(w.game()?.view).toMatchObject({ color: 'w', me: 'p1' });
    expect(b.game()?.view).toMatchObject({ color: 'b', me: 'p2' });
  });

  it('lets only the side to move play, refuses illegal moves and the host', async () => {
    const s = setup();
    const { code, tv, w, b } = await chessTable(s);
    await b.send({ type: 'action', game: 'chess', action: { type: 'move', uci: 'e7e5' } });
    expect(b.last('error')?.code).toBe('notYourTurn');
    await w.send({ type: 'action', game: 'chess', action: { type: 'move', uci: 'e2e5' } });
    expect(w.last('error')?.code).toBe('illegalMove');
    await tv.send({ type: 'action', game: 'chess', action: { type: 'move', uci: 'e2e4' } });
    expect(tv.last('error')?.code).toBe('forbidden');
    await w.send({ type: 'action', game: 'chess', action: { type: 'move', uci: 'e2e4' } });
    const state = s.manager.getState<ChessState>(code)!;
    expect(state.moves.map((m) => m.san)).toEqual(['e4']);
    expect(tv.game()?.view).toMatchObject({ phase: 'playing' });
  });

  it('plays the scholar mate and records winner and loser', async () => {
    const s = setup();
    const { code, w, b } = await chessTable(s);
    const moves = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
    for (const [i, uci] of moves.entries()) await (i % 2 ? b : w).send({ type: 'action', game: 'chess', action: { type: 'move', uci } });
    const state = s.manager.getState<ChessState>(code)!;
    expect(state.result).toMatchObject({ winner: 'w', reason: 'checkmate' });
    expect(chessAdapter.isFinished(state)).toBe(true);
    const input = chessRecordInput(7, state, '2026-10-25T20:00:00.000Z');
    expect(input).toMatchObject({ matchId: 7, gameType: 'chess' });
    expect(input.participants).toEqual([
      { participantId: 'p1', kind: 'player', playerId: 1, memberIds: [1], place: 1, score: 1 },
      { participantId: 'p2', kind: 'player', playerId: 2, memberIds: [2], place: 2, score: 0 },
    ]);
  });

  it('agrees a draw and lets a player resign', async () => {
    const s = setup();
    const { code, w, b } = await chessTable(s);
    await w.send({ type: 'action', game: 'chess', action: { type: 'acceptDraw' } });
    expect(w.last('error')?.code).toBe('noOffer');
    await w.send({ type: 'action', game: 'chess', action: { type: 'offerDraw' } });
    await w.send({ type: 'action', game: 'chess', action: { type: 'acceptDraw' } });
    expect(w.last('error')?.code).toBe('ownOffer');
    await b.send({ type: 'action', game: 'chess', action: { type: 'acceptDraw' } });
    const state = s.manager.getState<ChessState>(code)!;
    expect(state.result?.reason).toBe('agreement');
    expect(chessRecordInput(1, state, '2026-10-25T20:00:00.000Z').participants.map((p) => [p.place, p.score])).toEqual([
      [1, 0.5],
      [1, 0.5],
    ]);

    const t = setup();
    const second = await chessTable(t);
    await second.b.send({ type: 'action', game: 'chess', action: { type: 'resign' } });
    expect(t.manager.getState<ChessState>(second.code)!.result).toMatchObject({ winner: 'w', reason: 'resign' });
  });

  it('ends the game on time through the scheduler (flagAt)', async () => {
    const s = setup();
    const { code, w } = await chessTable(s, 3);
    expect(s.time.pending()).toBe(0); // the clock starts with the first move
    await w.send({ type: 'action', game: 'chess', action: { type: 'move', uci: 'e2e4' } });
    expect(s.time.pending()).toBe(1);
    await tick(s, 3 * 60_000 + 10);
    expect(s.manager.getState<ChessState>(code)!.result).toMatchObject({ winner: 'w', reason: 'timeout' });
  });
});

// ---------- cards ----------

const person = (id: string, name: string, hints = false): TableSeat => ({ id, name, avatar: '🙂', level: hints ? 'lavice' : 'hospoda', ai: null, hints });
const computer = (n: number, ai: AiLevel = 2): TableSeat => ({ id: `ai${n}`, name: `Robík ${n}`, avatar: '🤖', level: 'hospoda', ai, hints: false });

async function prsiRoom(s: ReturnType<typeof setup>, seats: TableSeat[], turnSeconds: number | null = null) {
  return s.manager.createGameRoom('prsi-hra', (code, createdAt, now) =>
    createPrsiRoom({ id: `prsi-${code}`, createdAt, now, seed: 42, seats, turnSeconds, aiDelayMs: 800 }),
  );
}

async function zolikyRoom(s: ReturnType<typeof setup>, seats: TableSeat[], rounds = 1) {
  return s.manager.createGameRoom('zoliky-hra', (code, createdAt, now) =>
    createZolikyRoom({ id: `zoliky-${code}`, createdAt, now, seed: 9, seats, aiDelayMs: 500, settings: { rounds } }),
  );
}

describe('rooms: digital prší', () => {
  it('waits in the lobby, offers only people as seats and shows each phone only its own hand', async () => {
    const s = setup();
    const { code, hostToken } = await prsiRoom(s, [person('p1', 'Táta'), person('p2', 'Anička', true), computer(1)]);
    expect(s.manager.seats(code).map((x) => x.id)).toEqual(['p1', 'p2']);
    const tv = s.client('tv');
    const a = s.client('a');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await a.send({ type: 'hello', code, role: 'player' });
    await a.send({ type: 'join', contestantId: 'p1' });
    await a.send({ type: 'action', game: 'prsi-hra', action: { type: 'draw' } });
    expect(a.last('error')?.code).toBe('wrongPhase');
    await a.send({ type: 'action', game: 'prsi-hra', action: { type: 'start' } });
    expect(a.last('error')?.code).toBe('forbidden');
    await tv.send({ type: 'action', game: 'prsi-hra', action: { type: 'start' } });

    const state = s.manager.getState<PrsiRoomState>(code)!;
    const mine = a.game()!;
    expect(mine.game === 'prsi-hra' && mine.view.hand).toEqual(state.table.hands.p1);
    const table = tv.game()!;
    expect(table.game === 'prsi-hra' && table.view.hand).toBeNull();
    expect(table.game === 'prsi-hra' && table.view.players.map((p) => p.cards)).toEqual([4, 4, 4]);
    for (const other of [...state.table.hands.p2, ...state.table.hands.ai1]) expect((mine.view as PrsiRoomView).hand).not.toContain(other);
    // Hints only for the child's own phone.
    expect(mine.game === 'prsi-hra' && mine.view.hint).toBeNull();
  });

  it('plays computer seats on the server after the pause', async () => {
    const s = setup();
    const { code, hostToken } = await prsiRoom(s, [computer(1), person('p1', 'Táta'), computer(2)]);
    const tv = s.client('tv');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    expect(s.time.pending()).toBe(0);
    await tv.send({ type: 'action', game: 'prsi-hra', action: { type: 'start' } });
    expect(s.manager.getState<PrsiRoomState>(code)!.table.turn).toBe('ai1');
    await tick(s, 799);
    expect(s.manager.getState<PrsiRoomState>(code)!.table.seq).toBe(1);
    await tick(s, 1);
    const after = s.manager.getState<PrsiRoomState>(code)!;
    expect(after.table.seq).toBeGreaterThan(1);
    expect(after.table.turn === 'p1' || after.table.phase !== 'playing').toBe(true);
    expect(s.time.pending()).toBe(0); // a person without a time limit
  });

  it('plays a whole game with one person and two computers and records only the person', async () => {
    const s = setup();
    const { code, hostToken } = await prsiRoom(s, [person('p1', 'Táta', true), computer(1, 1), computer(2, 3)]);
    const tv = s.client('tv');
    const a = s.client('a');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await a.send({ type: 'hello', code, role: 'player' });
    await a.send({ type: 'join', contestantId: 'p1' });
    await tv.send({ type: 'action', game: 'prsi-hra', action: { type: 'start' } });
    for (let i = 0; i < 2000; i++) {
      const room = s.manager.getState<PrsiRoomState>(code)!;
      if (room.table.phase === 'finished') break;
      if (room.table.turn === 'p1') {
        const view = a.game()!;
        expect(view.game === 'prsi-hra' && view.view.hint?.text).toBeTruthy();
        await a.send({ type: 'action', game: 'prsi-hra', action: choosePrsiMove(room.table, 'p1', 2).move });
      } else await tick(s, 800);
    }
    const room = s.manager.getState<PrsiRoomState>(code)!;
    expect(prsiRoomAdapter.isFinished(room)).toBe(true);
    const input = prsiRecordInput(3, room, '2026-10-25T20:00:00.000Z');
    expect(input.gameType).toBe('prsi');
    expect(input.participants).toHaveLength(1);
    const order = room.table.sheet.deals[0].order;
    expect(input.participants[0]).toMatchObject({ participantId: 'p1', playerId: 1, place: order.indexOf('p1') + 1 });
  });

  it('draws for a person whose turn limit ran out', async () => {
    const s = setup();
    const { code, hostToken } = await prsiRoom(s, [person('p1', 'Táta'), person('p2', 'Máma')], 30);
    const tv = s.client('tv');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await tv.send({ type: 'action', game: 'prsi-hra', action: { type: 'start' } });
    const before = s.manager.getState<PrsiRoomState>(code)!;
    const first = before.table.turn;
    const view = tv.game()!;
    expect(view.game === 'prsi-hra' && view.view.deadline).toBe(s.time.now + 30_000);
    await tick(s, 30_000);
    const after = s.manager.getState<PrsiRoomState>(code)!;
    expect(after.table.turn).not.toBe(first);
    expect(after.table.log.at(-1)).toMatchObject({ playerId: first });
  });
});

describe('rooms: digital žolíky', () => {
  it('lets computers take whole turns on the server and gives hints only to the child', async () => {
    const s = setup();
    const { code, hostToken } = await zolikyRoom(s, [person('p1', 'Anička', true), computer(1)]);
    const tv = s.client('tv');
    const a = s.client('a');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await a.send({ type: 'hello', code, role: 'player' });
    await a.send({ type: 'join', contestantId: 'p1' });
    await tv.send({ type: 'action', game: 'zoliky-hra', action: { type: 'start' } });
    const start = s.manager.getState<ZolikyRoomState>(code)!;
    expect(start.table.turn).toBe('p1');
    const mine = a.game()!;
    expect(mine.game === 'zoliky-hra' && mine.view.hint?.text).toBeTruthy();
    const table = tv.game()!;
    expect(table.game === 'zoliky-hra' && table.view.hint).toBeNull();
    expect(table.game === 'zoliky-hra' && table.view.hand).toBeNull();

    // Anička takes a card and discards it; then the computer plays (draw … discard) step by step.
    await a.send({ type: 'action', game: 'zoliky-hra', action: { type: 'drawStock' } });
    const hand = s.manager.getState<ZolikyRoomState>(code)!.table.hands.p1;
    await a.send({ type: 'action', game: 'zoliky-hra', action: { type: 'discard', cardId: hand[0] } });
    expect(s.manager.getState<ZolikyRoomState>(code)!.table.turn).toBe('ai1');
    for (let i = 0; i < 40 && s.manager.getState<ZolikyRoomState>(code)!.table.turn === 'ai1'; i++) await tick(s, 500);
    const after = s.manager.getState<ZolikyRoomState>(code)!;
    expect(after.table.turn === 'p1' || after.table.phase !== 'playing').toBe(true);
  });

  it('passes the engine reason of a refused lay-down to the phone', async () => {
    const s = setup();
    const { code, hostToken } = await zolikyRoom(s, [person('p1', 'Táta'), person('p2', 'Máma')]);
    const tv = s.client('tv');
    const a = s.client('a');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await tv.send({ type: 'action', game: 'zoliky-hra', action: { type: 'start' } });
    await a.send({ type: 'hello', code, role: 'player' });
    await a.send({ type: 'join', contestantId: 'p1' });
    await a.send({ type: 'action', game: 'zoliky-hra', action: { type: 'drawStock' } });
    const hand = s.manager.getState<ZolikyRoomState>(code)!.table.hands.p1;
    await a.send({ type: 'action', game: 'zoliky-hra', action: { type: 'meld', melds: [hand.slice(0, 3)] } });
    const error = a.last('error');
    expect(error?.code).toMatch(/badMeld|opening/);
    expect(error?.message.length).toBeGreaterThan(5);
  });

  it('plays a round to the end and records the person with card rounds', async () => {
    const s = setup();
    const { code, hostToken } = await zolikyRoom(s, [person('p4', 'Táta'), computer(1, 1)]);
    const tv = s.client('tv');
    const a = s.client('a');
    await tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    await a.send({ type: 'hello', code, role: 'player' });
    await a.send({ type: 'join', contestantId: 'p4' });
    await tv.send({ type: 'action', game: 'zoliky-hra', action: { type: 'start' } });
    for (let i = 0; i < 20000; i++) {
      const room = s.manager.getState<ZolikyRoomState>(code)!;
      if (room.table.phase !== 'playing') break;
      if (room.table.turn === 'p4') await a.send({ type: 'action', game: 'zoliky-hra', action: chooseZolikyCommand(room.table, 'p4', 2).command });
      else await tick(s, 500);
    }
    const room = s.manager.getState<ZolikyRoomState>(code)!;
    expect(zolikyRoomAdapter.isFinished(room)).toBe(true);
    const input = zolikyRecordInput(5, room, '2026-10-25T21:00:00.000Z');
    expect(input.gameType).toBe('zoliky');
    expect(input.participants.map((p) => p.playerId)).toEqual([4]);
    expect(input.cardRounds).toEqual([{ roundNo: 1, playerId: 4, points: room.table.lastRound!.points.p4 }]);
  });
});

describe('protocol: table games', () => {
  it('parses chess and card commands and drops unknown fields', () => {
    const m = parseClientMessage(JSON.stringify({ v, type: 'action', game: 'chess', action: { type: 'move', uci: 'e7e8q', by: 'w' } }));
    expect(m.ok && m.message).toMatchObject({ game: 'chess', action: { type: 'move', uci: 'e7e8q' } });
    expect(m.ok && JSON.stringify(m.message)).not.toContain('"by"');
    const p = parseClientMessage(JSON.stringify({ v, type: 'action', game: 'prsi-hra', action: { type: 'play', cardId: 'srdce-svrsek', suit: 'kule' } }));
    expect(p.ok).toBe(true);
    const z = parseClientMessage(JSON.stringify({ v, type: 'action', game: 'zoliky-hra', action: { type: 'meld', melds: [['srdce-2-0', 'srdce-3-0', 'srdce-4-0']] } }));
    expect(z.ok).toBe(true);
  });

  it('rejects malformed table commands', () => {
    const bad = [
      { game: 'chess', action: { type: 'move', uci: 'e2-e4' } },
      { game: 'chess', action: { type: 'timeout' } },
      { game: 'chess', action: { type: 'undo' } },
      { game: 'prsi-hra', action: { type: 'play', cardId: 'srdce-svrsek', suit: 'pik' } },
      { game: 'prsi-hra', action: { type: 'play' } },
      { game: 'zoliky-hra', action: { type: 'meld', melds: [] } },
      { game: 'zoliky-hra', action: { type: 'layOff', meldId: 'm1', cardIds: [] } },
      { game: 'zoliky-hra', action: { type: 'discard', cardId: 5 } },
    ];
    for (const b of bad) expect(parseClientMessage(JSON.stringify({ v, type: 'action', ...b })).ok).toBe(false);
  });
});
