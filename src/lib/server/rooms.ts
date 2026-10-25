// Live rooms without any networking: clients are opaque ids, messages go out through an
// injected `send`, time comes from an injected `clock` and timeouts from a `scheduler`.
// The ws server (ws.ts) and the tests drive the same code.

import { createHash, randomBytes } from 'node:crypto';
import type { Question } from '../types.ts';
import { applyLive, createLiveGame, type CreateLiveInput, type LiveAction, type LiveState } from '../engine/live.ts';
import {
  errorMessage,
  PROTOCOL_VERSION,
  viewFor,
  type ClientMessage,
  type ClientRole,
  type ErrorCode,
  type Presence,
  type ServerMessage,
  type Viewer,
} from '../live/protocol.ts';

/** Room codes avoid look-alike characters (0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

/** Everything needed to bring a room back after a restart. Plain JSON. */
export interface StoredRoom {
  code: string;
  createdAt: number;
  updatedAt: number;
  /** sha256 of the host token. */
  hostTokenHash: string;
  /** contestantId → sha256 of the phone's token. */
  claims: Record<string, string>;
  state: LiveState;
  /** Who created the room (household, evening); opaque to the room logic, used by the DB store. */
  meta?: RoomMeta;
}

export interface RoomMeta {
  householdId?: number;
  nightId?: number | null;
}

export interface RoomStore {
  save(room: StoredRoom): Promise<void>;
  load(code: string): Promise<StoredRoom | null>;
  list(): Promise<StoredRoom[]>;
}

/** Keeps rooms as JSON strings, so anything non-serializable fails here first. */
export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, string>();

  async save(room: StoredRoom): Promise<void> {
    this.rooms.set(room.code, JSON.stringify(room));
  }

  async load(code: string): Promise<StoredRoom | null> {
    const json = this.rooms.get(code);
    return json ? (JSON.parse(json) as StoredRoom) : null;
  }

  async list(): Promise<StoredRoom[]> {
    return [...this.rooms.values()].map((json) => JSON.parse(json) as StoredRoom);
  }
}

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface RoomManagerOptions {
  store: RoomStore;
  clock: () => number;
  scheduler: Scheduler;
  send: (clientId: string, message: ServerMessage) => void;
  /** Random source for room codes (default crypto). */
  random?: () => number;
  /** Token generator for host and phones (default 128 random bits). */
  newToken?: () => string;
}

export interface CreatedRoom {
  code: string;
  /** Give it to the TV only; it authorizes the host role. */
  hostToken: string;
}

interface Client {
  id: string;
  code: string | null;
  role: ClientRole | null;
  tokenHash: string | null;
  contestantId: string | null;
}

interface Room {
  data: StoredRoom;
  timer: unknown;
  /** Serializes work on one room (saves are async). */
  chain: Promise<void>;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cryptoRandom(): number {
  return randomBytes(4).readUInt32BE(0) / 4294967296;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private clients = new Map<string, Client>();
  private readonly opts: Required<RoomManagerOptions>;

  constructor(options: RoomManagerOptions) {
    this.opts = {
      random: cryptoRandom,
      newToken: () => randomBytes(16).toString('base64url'),
      ...options,
    };
  }

  // ---------- rooms ----------

  async createRoom(
    input: Omit<CreateLiveInput, 'createdAt'>,
    pool: Question[],
    seen: Record<string, readonly string[]> = {},
    meta?: RoomMeta,
  ): Promise<CreatedRoom> {
    const code = await this.freeCode();
    const now = this.opts.clock();
    const hostToken = this.opts.newToken();
    const state = createLiveGame({ ...input, id: input.id ?? `live-${code}`, createdAt: new Date(now).toISOString() }, pool, seen);
    const room: Room = {
      data: { code, createdAt: now, updatedAt: now, hostTokenHash: hashToken(hostToken), claims: {}, state, ...(meta ? { meta } : {}) },
      timer: null,
      chain: Promise.resolve(),
    };
    this.rooms.set(code, room);
    await this.opts.store.save(room.data);
    return { code, hostToken };
  }

  private async freeCode(): Promise<string> {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(this.opts.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code) && !(await this.opts.store.load(code))) return code;
    }
    throw new Error('[rooms] no free room code');
  }

  /** Loads every stored room into memory and re-arms timers (call once at startup). */
  async restore(): Promise<number> {
    let n = 0;
    for (const data of await this.opts.store.list()) {
      if (this.rooms.has(data.code)) continue;
      this.rooms.set(data.code, { data, timer: null, chain: Promise.resolve() });
      this.schedule(data.code);
      n++;
    }
    return n;
  }

  getState(code: string): LiveState | undefined {
    return this.rooms.get(code)?.data.state;
  }

  getRoom(code: string): StoredRoom | undefined {
    return this.rooms.get(code)?.data;
  }

  private async room(code: string): Promise<Room | undefined> {
    const existing = this.rooms.get(code);
    if (existing) return existing;
    const data = await this.opts.store.load(code);
    if (!data) return undefined;
    // Another call may have loaded it meanwhile.
    const raced = this.rooms.get(code);
    if (raced) return raced;
    const room: Room = { data, timer: null, chain: Promise.resolve() };
    this.rooms.set(code, room);
    this.schedule(code);
    return room;
  }

  private withRoom(room: Room, fn: () => Promise<void>): Promise<void> {
    const run = room.chain.then(fn, fn);
    room.chain = run.catch((err) => console.error('[rooms] task failed', { code: room.data.code, err: (err as Error).message }));
    return run;
  }

  /** Resolves when all queued room work is done (tests, shutdown). */
  async flush(): Promise<void> {
    await Promise.all([...this.rooms.values()].map((r) => r.chain));
  }

  dispose(): void {
    for (const room of this.rooms.values()) {
      if (room.timer !== null) this.opts.scheduler.clear(room.timer);
      room.timer = null;
    }
  }

  // ---------- timeouts ----------

  private schedule(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.timer !== null) {
      this.opts.scheduler.clear(room.timer);
      room.timer = null;
    }
    const deadline = room.data.state.deadline;
    if (deadline === null || room.data.state.phase !== 'asking') return;
    const delay = Math.max(0, deadline - this.opts.clock());
    room.timer = this.opts.scheduler.set(() => {
      room.timer = null;
      void this.withRoom(room, () => this.fireTimeout(room));
    }, delay);
  }

  private async fireTimeout(room: Room): Promise<void> {
    const state = room.data.state;
    if (state.deadline === null) return;
    if (this.opts.clock() < state.deadline) {
      this.schedule(room.data.code); // fired early (coarse timers)
      return;
    }
    const result = applyLive(state, { type: 'timeout', by: { role: 'system' }, now: this.opts.clock() });
    if (result.ok) await this.commit(room, result.state);
  }

  private async commit(room: Room, state: LiveState): Promise<void> {
    room.data = { ...room.data, state, updatedAt: this.opts.clock() };
    await this.opts.store.save(room.data);
    this.schedule(room.data.code);
    this.broadcast(room);
  }

  // ---------- clients ----------

  connect(clientId: string): void {
    this.clients.set(clientId, { id: clientId, code: null, role: null, tokenHash: null, contestantId: null });
  }

  async disconnect(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    this.clients.delete(clientId);
    const room = client?.code ? this.rooms.get(client.code) : undefined;
    if (room) await this.withRoom(room, async () => this.broadcast(room));
  }

  async handle(clientId: string, message: ClientMessage): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (message.v !== PROTOCOL_VERSION) return this.error(client, 'version');
    if (message.type === 'ping') {
      this.opts.send(clientId, { v: PROTOCOL_VERSION, type: 'pong', t: message.t ?? null });
      return;
    }
    if (message.type === 'hello') return this.hello(client, message);
    const room = client.code ? this.rooms.get(client.code) : undefined;
    if (!room) return this.error(client, 'notHello');
    await this.withRoom(room, async () => {
      if (message.type === 'join') return this.join(client, room, message.contestantId);
      if (message.type === 'leave') return this.leave(client, room);
      if (message.type === 'action') return this.action(client, room, message.action);
    });
  }

  private error(client: Client, code: ErrorCode): void {
    this.opts.send(client.id, errorMessage(code));
  }

  private async hello(client: Client, message: Extract<ClientMessage, { type: 'hello' }>): Promise<void> {
    const room = await this.room(message.code);
    if (!room) return this.error(client, 'roomNotFound');
    await this.withRoom(room, async () => {
      const previous = client.code ? this.rooms.get(client.code) : undefined;
      if (message.role === 'host') {
        if (!message.token || hashToken(message.token) !== room.data.hostTokenHash) return this.error(client, 'forbidden');
        Object.assign(client, { code: room.data.code, role: 'host', tokenHash: room.data.hostTokenHash, contestantId: null });
        this.welcome(client, message.token);
      } else {
        const token = message.token ?? this.opts.newToken();
        const tokenHash = hashToken(token);
        const state = room.data.state;
        const claimed = Object.entries(room.data.claims).find(([, h]) => h === tokenHash)?.[0] ?? null;
        const contestantId = claimed && !state.kicked.includes(claimed) ? claimed : null;
        Object.assign(client, { code: room.data.code, role: 'player', tokenHash, contestantId });
        this.welcome(client, token);
      }
      if (previous && previous !== room) this.broadcast(previous);
      this.broadcast(room);
    });
  }

  private welcome(client: Client, token: string): void {
    this.opts.send(client.id, {
      v: PROTOCOL_VERSION,
      type: 'welcome',
      code: client.code!,
      role: client.role!,
      token,
      contestantId: client.contestantId,
    });
  }

  private async join(client: Client, room: Room, contestantId: string): Promise<void> {
    if (client.role !== 'player' || !client.tokenHash) return this.error(client, 'forbidden');
    const state = room.data.state;
    const contestant = state.config.contestants.find((c) => c.id === contestantId);
    if (!contestant) return this.error(client, 'unknownContestant');
    if (contestant.onTv || state.phase === 'finished') return this.error(client, 'forbidden');
    if (state.kicked.includes(contestantId)) return this.error(client, 'kicked');
    const holder = room.data.claims[contestantId];
    if (holder && holder !== client.tokenHash) return this.error(client, 'taken');
    const claims = Object.fromEntries(Object.entries(room.data.claims).filter(([, h]) => h !== client.tokenHash));
    claims[contestantId] = client.tokenHash;
    room.data = { ...room.data, claims, updatedAt: this.opts.clock() };
    for (const c of this.clientsOf(room)) if (c.tokenHash === client.tokenHash) c.contestantId = contestantId;
    await this.opts.store.save(room.data);
    this.broadcast(room);
  }

  private async leave(client: Client, room: Room): Promise<void> {
    if (client.role !== 'player' || !client.tokenHash) return this.error(client, 'forbidden');
    const claims = Object.fromEntries(Object.entries(room.data.claims).filter(([, h]) => h !== client.tokenHash));
    room.data = { ...room.data, claims, updatedAt: this.opts.clock() };
    for (const c of this.clientsOf(room)) if (c.tokenHash === client.tokenHash) c.contestantId = null;
    await this.opts.store.save(room.data);
    this.broadcast(room);
  }

  private async action(client: Client, room: Room, command: Extract<ClientMessage, { type: 'action' }>['action']): Promise<void> {
    let by: LiveAction['by'];
    if (client.role === 'host') by = { role: 'host' };
    else if (client.contestantId) by = { role: 'contestant', contestantId: client.contestantId };
    else return this.error(client, 'notJoined');
    const result = applyLive(room.data.state, { ...command, by, now: this.opts.clock() } as LiveAction);
    if (!result.ok) return this.error(client, result.error);
    if (result.state === room.data.state) return;
    if (command.type === 'kick') this.releaseKicked(room, command.contestantId);
    await this.commit(room, result.state);
  }

  /** A kicked contestant loses its phone: claim dropped, attached clients detached and told. */
  private releaseKicked(room: Room, contestantId: string): void {
    const hash = room.data.claims[contestantId];
    const claims = { ...room.data.claims };
    delete claims[contestantId];
    room.data = { ...room.data, claims };
    for (const c of this.clientsOf(room)) {
      if (c.contestantId === contestantId || (hash && c.tokenHash === hash)) {
        c.contestantId = null;
        this.error(c, 'kicked');
      }
    }
  }

  // ---------- broadcast ----------

  private clientsOf(room: Room): Client[] {
    return [...this.clients.values()].filter((c) => c.code === room.data.code);
  }

  presence(code: string): Record<string, Presence> {
    const room = this.rooms.get(code);
    if (!room) return {};
    const online = new Set(this.clientsOf(room).map((c) => c.contestantId).filter((id): id is string => !!id));
    return Object.fromEntries(
      room.data.state.config.contestants.map((c) => [c.id, { claimed: c.id in room.data.claims, online: online.has(c.id) }]),
    );
  }

  private broadcast(room: Room): void {
    const presence = this.presence(room.data.code);
    const now = this.opts.clock();
    for (const c of this.clientsOf(room)) {
      const viewer: Viewer =
        c.role === 'host' ? { role: 'host' } : c.contestantId ? { role: 'contestant', contestantId: c.contestantId } : { role: 'spectator' };
      this.opts.send(c.id, { v: PROTOCOL_VERSION, type: 'state', view: viewFor(room.data.state, viewer), presence, now });
    }
  }
}
