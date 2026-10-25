import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, type ServerMessage } from '../../src/lib/live/protocol.ts';
import { loadQuestionsFromDir } from '../../src/lib/server/questions-fs.ts';
import { createLiveHub, rejectForeignUpgrades, type LiveHub } from '../../src/lib/server/ws.ts';
import { makePool, players } from './helpers.ts';

const v = PROTOCOL_VERSION;

class TestClient {
  messages: ServerMessage[] = [];
  private waiters: { test: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const m = JSON.parse(String(data)) as ServerMessage;
      this.messages.push(m);
      this.waiters = this.waiters.filter((w) => (w.test(m) ? (w.resolve(m), false) : true));
    });
  }
  static async open(url: string): Promise<TestClient> {
    const ws = new WebSocket(url);
    const client = new TestClient(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return client;
  }
  send(m: Record<string, unknown>) {
    this.ws.send(JSON.stringify({ v, ...m }));
  }
  /** Waits for the next message (from now on) matching `test`. */
  next(test: (m: ServerMessage) => boolean, ms = 2000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for message')), ms);
      this.waiters.push({ test, resolve: (m) => (clearTimeout(timer), resolve(m)) });
    });
  }
}

describe('ws server', () => {
  let server: Server;
  let hub: LiveHub;
  let detach: () => Promise<void>;
  let url: string;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    hub = createLiveHub({ loadPool: () => makePool({ hospoda: 'choice', lavice: 'choice', piskoviste: 'choice' }) });
    server = createServer((_req, res) => res.end('ok'));
    detach = hub.attach(server);
    rejectForeignUpgrades(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
  });

  afterEach(async () => {
    for (const c of clients.splice(0)) c.ws.terminate();
    hub.rooms.dispose();
    await detach();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function open() {
    const c = await TestClient.open(url);
    clients.push(c);
    return c;
  }

  it('plays a step with a TV and a phone over real sockets', async () => {
    const { code, hostToken } = await hub.createRoom({
      seed: 1,
      themes: ['priroda'],
      questionsPerContestant: 1,
      timerSeconds: null,
      contestants: players.slice(0, 2).map((p) => ({ ...p, onTv: false })),
    });
    const tv = await open();
    const phone = await open();

    const tvState = tv.next((m) => m.type === 'state');
    tv.send({ type: 'hello', code, role: 'host', token: hostToken });
    expect((await tvState).type).toBe('state');

    const welcome = phone.next((m) => m.type === 'welcome');
    phone.send({ type: 'hello', code: code.toLowerCase(), role: 'player' });
    expect(await welcome).toMatchObject({ type: 'welcome', contestantId: null });

    const joined = tv.next((m) => m.type === 'state' && m.presence.tata?.claimed === true);
    phone.send({ type: 'join', contestantId: 'tata' });
    await joined;

    const phoneAsking = phone.next((m) => m.type === 'state' && m.view.phase === 'asking');
    tv.send({ type: 'action', action: { type: 'start' } });
    tv.send({ type: 'action', action: { type: 'startRound' } });
    const asking = await phoneAsking;
    if (asking.type !== 'state') throw new Error('unexpected');
    expect(asking.view.question?.options).toBeDefined();
    expect(JSON.stringify(asking)).not.toContain('"answer"');

    const tvSaw = tv.next((m) => m.type === 'state' && m.view.contestants.some((c) => c.id === 'tata' && c.answered));
    phone.send({ type: 'action', action: { type: 'answer', value: 'Ano' } });
    await tvSaw;

    const revealed = tv.next((m) => m.type === 'state' && m.view.phase === 'reveal');
    tv.send({ type: 'action', action: { type: 'closeAnswers' } });
    const reveal = await revealed;
    if (reveal.type !== 'state') throw new Error('unexpected');
    expect(reveal.view.reveal?.find((r) => r.contestantId === 'tata')).toMatchObject({ correct: true, points: 1 });
  });

  it('rejects malformed messages and a wrong protocol version', async () => {
    const c = await open();
    const bad = c.next((m) => m.type === 'error');
    c.ws.send('not json');
    expect(await bad).toMatchObject({ code: 'badMessage' });
    const version = c.next((m) => m.type === 'error');
    c.ws.send(JSON.stringify({ v: 99, type: 'ping' }));
    expect(await version).toMatchObject({ code: 'version' });
    const pong = c.next((m) => m.type === 'pong');
    c.send({ type: 'ping', t: 1 });
    expect(await pong).toMatchObject({ t: 1 });
  });

  it('closes a socket that sends an oversized message', async () => {
    const c = await open();
    const closed = new Promise<number>((resolve) => c.ws.once('close', (codeNum) => resolve(codeNum)));
    c.ws.send(JSON.stringify({ v, type: 'ping', pad: 'x'.repeat(10_000) }));
    expect(await closed).toBe(1009);
  });

  it('refuses upgrades on other paths', async () => {
    const other = new WebSocket(url.replace('/ws', '/hmr'));
    const outcome = await new Promise<string>((resolve) => {
      other.once('open', () => resolve('open'));
      other.once('error', () => resolve('error'));
      setTimeout(() => resolve('pending'), 300);
    });
    other.terminate();
    expect(outcome).toBe('error');
  });
});

describe('questions-fs', () => {
  it('loads only verified questions like the Vite loader', () => {
    const qs = loadQuestionsFromDir(join(import.meta.dirname, '..', 'fixtures', 'questions'));
    expect(qs).toHaveLength(31);
    expect(qs.every((q) => q.status === 'verified')).toBe(true);
    expect(loadQuestionsFromDir(join(import.meta.dirname, '..', 'fixtures', 'questions'), { includeDraft: true })).toHaveLength(32);
  });

  it('returns nothing for a missing directory', () => {
    expect(loadQuestionsFromDir('/nonexistent/questions')).toEqual([]);
  });
});
