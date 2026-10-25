import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../../src/lib/live/protocol.ts';
import { backoffDelay, BACKOFF_MAX_MS, LiveConnection, type ConnectionStatus, type SocketLike, type Timers } from '../../src/lib/live-client/connection.ts';
import { secondsLeft, wsUrl } from '../../src/lib/live-client/clock.ts';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  // test controls
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(m: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...m }) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

class FakeTimers implements Timers {
  now = 0;
  private seq = 0;
  private tasks: { id: number; at: number; fn: () => void; every?: number }[] = [];
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.seq;
    this.tasks.push({ id, at: this.now + ms, fn });
    return id;
  }
  setInterval(fn: () => void, ms: number) {
    const id = ++this.seq;
    this.tasks.push({ id, at: this.now + ms, fn, every: ms });
    return id;
  }
  clearTimeout(h: unknown) {
    this.tasks = this.tasks.filter((t) => t.id !== h);
  }
  clearInterval(h: unknown) {
    this.clearTimeout(h);
  }
  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const next = this.tasks.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.now = next.at;
      if (next.every) next.at += next.every;
      else this.tasks = this.tasks.filter((t) => t !== next);
      next.fn();
    }
    this.now = end;
  }
  pendingTimeouts() {
    return this.tasks.filter((t) => !t.every).length;
  }
}

function setup(token?: string) {
  const timers = new FakeTimers();
  const sockets: FakeSocket[] = [];
  const statuses: ConnectionStatus[] = [];
  const stored: string[] = token ? [token] : [];
  const messages: unknown[] = [];
  const conn = new LiveConnection({
    url: 'ws://test/ws',
    code: 'ABCD',
    role: 'player',
    tokens: { get: () => stored.at(-1), set: (t) => void stored.push(t) },
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    timers,
    now: () => timers.now,
    random: () => 0.5,
    pingMs: 1000,
    deadAfterMs: 3000,
  });
  return { conn, timers, sockets, statuses, stored, messages };
}

describe('backoffDelay', () => {
  it('doubles from 500 ms and caps at 10 s', () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3].map((a) => backoffDelay(a, mid))).toEqual([500, 1000, 2000, 4000]);
    expect(backoffDelay(20, mid)).toBe(BACKOFF_MAX_MS);
  });

  it('adds at most ±20 % jitter', () => {
    expect(backoffDelay(1, () => 0)).toBe(800);
    expect(backoffDelay(1, () => 0.999999)).toBe(1200);
  });
});

describe('LiveConnection', () => {
  it('says hello with the stored token and keeps the token from welcome', () => {
    const { conn, sockets, stored, statuses } = setup('old-token');
    conn.start();
    sockets[0].open();
    expect(sockets[0].sent[0]).toEqual({ v: PROTOCOL_VERSION, type: 'hello', code: 'ABCD', role: 'player', token: 'old-token' });
    sockets[0].receive({ type: 'welcome', code: 'ABCD', role: 'player', token: 'new-token', contestantId: 'p1' });
    expect(stored.at(-1)).toBe('new-token');
    expect(statuses.at(-1)).toBe('open');
  });

  it('reconnects with growing delays and resets them after a welcome', () => {
    const { conn, sockets, timers, statuses } = setup();
    conn.start();
    sockets[0].drop();
    expect(statuses.at(-1)).toBe('reconnecting');
    timers.advance(499);
    expect(sockets).toHaveLength(1);
    timers.advance(1);
    expect(sockets).toHaveLength(2);
    sockets[1].drop();
    timers.advance(999);
    expect(sockets).toHaveLength(2);
    timers.advance(1);
    expect(sockets).toHaveLength(3);
    sockets[2].open();
    sockets[2].receive({ type: 'welcome', code: 'ABCD', role: 'player', token: 't', contestantId: null });
    sockets[2].drop();
    timers.advance(500);
    expect(sockets).toHaveLength(4);
  });

  it('reconnects with the same token, so the phone gets its contestant back', () => {
    const { conn, sockets, timers } = setup();
    conn.start();
    sockets[0].open();
    sockets[0].receive({ type: 'welcome', code: 'ABCD', role: 'player', token: 'mine', contestantId: 'p1' });
    sockets[0].drop();
    timers.advance(500);
    sockets[1].open();
    expect(sockets[1].sent[0]).toMatchObject({ type: 'hello', token: 'mine' });
  });

  it('drops a silent connection after the heartbeat deadline', () => {
    const { conn, sockets, timers, statuses } = setup();
    conn.start();
    sockets[0].open();
    sockets[0].receive({ type: 'welcome', code: 'ABCD', role: 'player', token: 't', contestantId: null });
    timers.advance(1000);
    expect(sockets[0].sent.some((m) => m.type === 'ping')).toBe(true);
    timers.advance(3000);
    expect(sockets[0].closed).toBe(true);
    expect(statuses.at(-1)).toBe('reconnecting');
  });

  it('stops for good when the room does not exist', () => {
    const { conn, sockets, timers, statuses } = setup();
    conn.start();
    sockets[0].open();
    sockets[0].receive({ type: 'error', code: 'roomNotFound', message: 'x' });
    expect(statuses.at(-1)).toBe('failed');
    timers.advance(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('does not send actions while disconnected and reconnects at once on demand', () => {
    const { conn, sockets, timers } = setup();
    conn.start();
    expect(conn.send({ type: 'leave' })).toBe(false);
    sockets[0].drop();
    expect(timers.pendingTimeouts()).toBe(1);
    conn.reconnectNow();
    expect(sockets).toHaveLength(2);
    expect(timers.pendingTimeouts()).toBe(0);
    sockets[1].open();
    sockets[1].receive({ type: 'welcome', code: 'ABCD', role: 'player', token: 't', contestantId: null });
    expect(conn.send({ type: 'join', contestantId: 'p1' })).toBe(true);
    expect(sockets[1].sent.at(-1)).toEqual({ v: PROTOCOL_VERSION, type: 'join', contestantId: 'p1' });
  });

  it('stop() closes without reconnecting', () => {
    const { conn, sockets, timers, statuses } = setup();
    conn.start();
    sockets[0].open();
    conn.stop();
    timers.advance(60_000);
    expect(sockets).toHaveLength(1);
    expect(statuses.at(-1)).toBe('closed');
  });
});

describe('secondsLeft', () => {
  it('corrects the countdown for the server clock offset', () => {
    expect(secondsLeft(null, 0, 0)).toBeNull();
    // Server is 5 s ahead of the phone: 20 s left on the server clock.
    expect(secondsLeft(125_000, 100_000, 5_000)).toBe(20);
    expect(secondsLeft(100_000, 200_000, 0)).toBe(0);
  });

  it('builds the socket url from the page location', () => {
    expect(wsUrl({ protocol: 'http:', host: '100.66.23.17:3000' })).toBe('ws://100.66.23.17:3000/ws');
    expect(wsUrl({ protocol: 'https:', host: 'liga.example' })).toBe('wss://liga.example/ws');
  });
});
