// WebSocket client for a live room: hello with a stored token, auto-reconnect with backoff,
// heartbeat that notices a dead connection (phone asleep, Wi-Fi gone). No Svelte, no DOM
// globals unless defaults are used, so it is unit-testable with fakes.

import { PROTOCOL_VERSION, type ClientMessage, type ClientRole, type ErrorCode, type ServerMessage } from '../live/protocol.ts';

export type ConnectionStatus =
  /** First connection attempt. */
  | 'connecting'
  /** Welcomed by the server. */
  | 'open'
  /** Lost the connection, trying again. */
  | 'reconnecting'
  /** The server refused us for good (room gone, bad host token, old app). */
  | 'failed'
  /** Stopped by the page. */
  | 'closed';

/** Subset of the browser WebSocket we use. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface TokenStore {
  get(): string | undefined;
  set(token: string): void;
}

export interface ConnectionOptions {
  url: string;
  code: string;
  role: ClientRole;
  tokens: TokenStore;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: ConnectionStatus, error?: { code: ErrorCode; message: string }) => void;
  createSocket?: (url: string) => SocketLike;
  timers?: Timers;
  now?: () => number;
  random?: () => number;
  /** Heartbeat period. */
  pingMs?: number;
  /** Silence after a ping that counts as a dead connection. */
  deadAfterMs?: number;
}

/** A client message without the protocol version (added on send). */
export type OutgoingMessage = ClientMessage extends infer M ? (M extends unknown ? Omit<M, 'v'> : never) : never;

const OPEN = 1;
/** Refusals that will not change by retrying. */
const FATAL: readonly ErrorCode[] = ['roomNotFound', 'forbidden', 'version'];

export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 10_000;

/** 0.5 s, 1 s, 2 s, … capped at 10 s, ±20 % jitter so phones do not reconnect in lockstep. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.8 + random() * 0.4));
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export class LiveConnection {
  status: ConnectionStatus = 'connecting';
  private socket: SocketLike | null = null;
  private attempt = 0;
  private retryTimer: unknown = null;
  private heartbeat: unknown = null;
  private lastHeard = 0;
  private welcomed = false;
  private stopped = false;
  private readonly o: Required<Omit<ConnectionOptions, 'createSocket'>> & { createSocket: (url: string) => SocketLike };

  constructor(options: ConnectionOptions) {
    this.o = {
      timers: defaultTimers,
      now: Date.now,
      random: Math.random,
      pingMs: 10_000,
      deadAfterMs: 25_000,
      createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
      ...options,
    };
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onclose = null;
      s.close(1000, 'bye');
    }
    this.setStatus('closed');
  }

  /** Skips the backoff wait (page became visible, network came back). */
  reconnectNow(): void {
    if (this.stopped || this.status === 'failed') return;
    if (this.socket && this.socket.readyState === OPEN && this.welcomed) return;
    if (this.retryTimer !== null) {
      this.o.timers.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.attempt = 0;
    this.dropSocket();
    this.open();
  }

  /** Sends when connected; returns false otherwise (actions are not queued, they could be stale). */
  send(message: OutgoingMessage): boolean {
    if (!this.socket || this.socket.readyState !== OPEN || !this.welcomed) return false;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...message }));
    return true;
  }

  private setStatus(status: ConnectionStatus, error?: { code: ErrorCode; message: string }): void {
    this.status = status;
    this.o.onStatus(status, error);
  }

  private open(): void {
    if (this.stopped) return;
    this.welcomed = false;
    let socket: SocketLike;
    try {
      socket = this.o.createSocket(this.o.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.lastHeard = this.o.now();
      const token = this.o.tokens.get();
      socket.send(
        JSON.stringify({ v: PROTOCOL_VERSION, type: 'hello', code: this.o.code, role: this.o.role, ...(token ? { token } : {}) }),
      );
      this.startHeartbeat();
    };
    socket.onmessage = (ev) => {
      this.lastHeard = this.o.now();
      let message: ServerMessage;
      try {
        message = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === 'welcome') {
        this.welcomed = true;
        this.attempt = 0;
        this.o.tokens.set(message.token);
        this.setStatus('open');
      } else if (message.type === 'error' && !this.welcomed && FATAL.includes(message.code)) {
        this.stopped = true;
        this.clearTimers();
        this.dropSocket();
        this.setStatus('failed', { code: message.code, message: message.message });
        return;
      }
      if (message.type !== 'pong') this.o.onMessage(message);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearHeartbeat();
      this.scheduleRetry();
    };
    socket.onerror = () => {
      // onclose follows and schedules the retry.
    };
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    this.setStatus('reconnecting');
    const delay = backoffDelay(this.attempt++, this.o.random);
    this.retryTimer = this.o.timers.setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeat = this.o.timers.setInterval(() => {
      const s = this.socket;
      if (!s || s.readyState !== OPEN) return;
      if (this.o.now() - this.lastHeard > this.o.deadAfterMs) {
        // Silent socket: browsers may take minutes to notice on their own.
        this.dropSocket();
        this.clearHeartbeat();
        this.scheduleRetry();
        return;
      }
      s.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'ping', t: this.o.now() }));
    }, this.o.pingMs);
  }

  private dropSocket(): void {
    const s = this.socket;
    this.socket = null;
    if (!s) return;
    s.onclose = null;
    s.onmessage = null;
    try {
      s.close(4000, 'reconnect');
    } catch {
      // ignore
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeat !== null) this.o.timers.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private clearTimers(): void {
    this.clearHeartbeat();
    if (this.retryTimer !== null) this.o.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
