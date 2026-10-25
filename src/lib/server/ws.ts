// WebSocket transport for live rooms on path /ws.
// Dev: the Vite plugin in vite.config.ts attaches it to Vite's http server.
// Prod: server.ts attaches it next to the adapter-node handler.
// The hub is a process-wide singleton on globalThis, because in dev the Vite config and the
// SvelteKit SSR modules load this file as two separate module instances.

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { Question } from '../types.ts';
import type { CreateLiveInput } from '../engine/live.ts';
import { createAktivity, type CreateAktivityInput } from '../games/aktivity/engine.ts';
import type { AktivityCard } from '../games/aktivity/types.ts';
import { createMjzGame, type CreateMjzInput } from '../games/mjz/engine.ts';
import { loadAktivityCards } from './games/aktivity.ts';
import { errorMessage, MAX_MESSAGE_BYTES, parseClientMessage, type ServerMessage } from '../live/protocol.ts';
import { MemoryRoomStore, realScheduler, RoomManager, type CreatedRoom, type RoomMeta, type RoomStore, type Scheduler } from './rooms.ts';
import { loadQuestionsFromDir } from './questions-fs.ts';

export const WS_PATH = '/ws';

export interface LiveHubOptions {
  store?: RoomStore;
  clock?: () => number;
  scheduler?: Scheduler;
  /** Question pool for new rooms; default reads data/questions (QUESTIONS_DIR) once. */
  loadPool?: () => Question[];
  /** Word cards of „Řekni, ukaž, nakresli“; default reads data/aktivity (AKTIVITY_DIR) once. */
  loadAktivityCards?: () => AktivityCard[];
  heartbeatMs?: number;
  /** Max messages per client per second before the socket is closed. */
  maxMessagesPerSecond?: number;
}

export interface LiveHub {
  rooms: RoomManager;
  /** Creates a room from the server-side question pool. */
  createRoom(input: Omit<CreateLiveInput, 'createdAt'>, seen?: Record<string, readonly string[]>, meta?: RoomMeta): Promise<CreatedRoom>;
  /** „Řekni, ukaž, nakresli“; `seen` = card ids the players already played. */
  createAktivityRoom(input: Omit<CreateAktivityInput, 'createdAt' | 'id'>, seen?: readonly string[], meta?: RoomMeta): Promise<CreatedRoom>;
  /** „Město, jméno, zvíře“. */
  createMjzRoom(input: Omit<CreateMjzInput, 'createdAt' | 'id'>, meta?: RoomMeta): Promise<CreatedRoom>;
  /** Attaches the /ws endpoint to an http server; returns a detach function. */
  attach(server: Server): () => Promise<void>;
  /** Number of open sockets (diagnostics, tests). */
  socketCount(): number;
}

export function createLiveHub(options: LiveHubOptions = {}): LiveHub {
  const sockets = new Map<string, WebSocket>();
  const heartbeatMs = options.heartbeatMs ?? 30_000;
  const maxRate = options.maxMessagesPerSecond ?? 30;
  let pool: Question[] | null = null;
  const loadPool = options.loadPool ?? (() => loadQuestionsFromDir());
  let cards: AktivityCard[] | null = null;
  const loadCards = options.loadAktivityCards ?? (() => loadAktivityCards());

  const send = (clientId: string, message: ServerMessage) => {
    const ws = sockets.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  };

  const rooms = new RoomManager({
    store: options.store ?? new MemoryRoomStore(),
    clock: options.clock ?? Date.now,
    scheduler: options.scheduler ?? realScheduler,
    send,
  });

  function onConnection(ws: WebSocket): void {
    const clientId = randomUUID();
    sockets.set(clientId, ws);
    rooms.connect(clientId);
    let alive = true;
    let windowStart = Date.now();
    let count = 0;

    ws.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, heartbeatMs);

    ws.on('message', (data: RawData, isBinary: boolean) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > maxRate) {
        send(clientId, errorMessage('rateLimited'));
        ws.close(1008, 'rate limit');
        return;
      }
      if (isBinary) {
        send(clientId, errorMessage('badMessage'));
        return;
      }
      const text = Array.isArray(data) ? Buffer.concat(data).toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8');
      const parsed = parseClientMessage(text);
      if (!parsed.ok) {
        send(clientId, errorMessage(parsed.code));
        return;
      }
      rooms.handle(clientId, parsed.message).catch((err) => {
        console.error('[ws] message handling failed', { err: (err as Error).message });
        send(clientId, errorMessage('serverError'));
      });
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      sockets.delete(clientId);
      void rooms.disconnect(clientId);
    });
    ws.on('error', (err) => console.warn('[ws] socket error', { err: err.message }));
  }

  return {
    rooms,
    async createRoom(input, seen = {}, meta) {
      pool ??= loadPool();
      return rooms.createRoom(input, pool, seen, meta);
    },
    async createAktivityRoom(input, seen = [], meta) {
      cards ??= loadCards();
      const pool = cards;
      return rooms.createGameRoom('aktivity', (code, createdAt) => createAktivity({ ...input, id: `aktivity-${code}`, createdAt }, pool, seen), meta);
    },
    async createMjzRoom(input, meta) {
      return rooms.createGameRoom('mjz', (code, createdAt) => createMjzGame({ ...input, id: `mjz-${code}`, createdAt }), meta);
    },
    attach(server: Server) {
      const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
      wss.on('connection', onConnection);
      const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const path = (req.url ?? '').split('?')[0];
        // Other upgrades (Vite HMR) are left alone.
        if (path !== WS_PATH) return;
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      };
      server.on('upgrade', onUpgrade);
      return async () => {
        server.off('upgrade', onUpgrade);
        for (const ws of wss.clients) ws.terminate();
        await new Promise<void>((resolve) => wss.close(() => resolve()));
      };
    },
    socketCount: () => sockets.size,
  };
}

/**
 * Prod only: destroys upgrade requests on any other path, so they do not hang.
 * Not for dev, where Vite's HMR socket shares the server.
 */
export function rejectForeignUpgrades(server: Server): void {
  server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
    if ((req.url ?? '').split('?')[0] !== WS_PATH) socket.destroy();
  });
}

const HUB_KEY = Symbol.for('domaci-liga.live-hub');

/** Process-wide hub (one room registry for the ws endpoint and SvelteKit routes). */
export function getLiveHub(): LiveHub {
  const g = globalThis as typeof globalThis & { [HUB_KEY]?: LiveHub };
  g[HUB_KEY] ??= createLiveHub();
  return g[HUB_KEY];
}

/** Replaces the process-wide hub, e.g. with a DB-backed store at startup. Call before attach. */
export function setLiveHub(hub: LiveHub): void {
  (globalThis as typeof globalThis & { [HUB_KEY]?: LiveHub })[HUB_KEY] = hub;
}
