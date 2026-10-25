// Reactive live room for Svelte 5 pages: the latest view, presence, connection status,
// last error and a countdown corrected for the difference between phone and server clocks.

import type { LiveCommand } from '../engine/live.ts';
import type { ClientRole, ErrorCode, LiveView, Presence, ServerMessage } from '../live/protocol.ts';
import type { Question } from '../types.ts';
import { LiveConnection, type ConnectionStatus } from './connection.ts';
import { secondsLeft, wsUrl } from './clock.ts';
import { tokenStore } from './tokens.ts';

export interface RoomError {
  code: ErrorCode;
  message: string;
  at: number;
}

export class LiveRoom {
  view = $state.raw<LiveView | null>(null);
  presence = $state.raw<Record<string, Presence>>({});
  status = $state<ConnectionStatus>('connecting');
  error = $state.raw<RoomError | null>(null);
  /** Contestant this phone plays for (from welcome/state). */
  me = $state<string | null>(null);
  /** Questions seen in reveals, for the final screen (the server sends no questions after that). */
  questions = $state.raw<Record<string, Question>>({});
  private now = $state(Date.now());
  private offset = 0;
  private conn: LiveConnection;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private cleanup: (() => void)[] = [];

  readonly remaining = $derived(secondsLeft(this.view?.deadline ?? null, this.now, this.offset));

  constructor(
    readonly code: string,
    readonly role: ClientRole,
  ) {
    this.conn = new LiveConnection({
      url: wsUrl(location),
      code,
      role,
      tokens: tokenStore(role, code),
      onMessage: (m) => this.onMessage(m),
      onStatus: (status, error) => {
        this.status = status;
        if (error) this.error = { ...error, at: Date.now() };
      },
    });
  }

  connect(): void {
    this.conn.start();
    this.ticker = setInterval(() => (this.now = Date.now()), 250);
    const wake = () => {
      if (document.visibilityState === 'visible') this.conn.reconnectNow();
    };
    const online = () => this.conn.reconnectNow();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', online);
    window.addEventListener('pageshow', online);
    this.cleanup.push(
      () => document.removeEventListener('visibilitychange', wake),
      () => window.removeEventListener('online', online),
      () => window.removeEventListener('pageshow', online),
    );
  }

  destroy(): void {
    this.conn.stop();
    if (this.ticker) clearInterval(this.ticker);
    for (const fn of this.cleanup.splice(0)) fn();
  }

  act(action: LiveCommand): boolean {
    return this.send({ type: 'action', action });
  }

  join(contestantId: string): boolean {
    return this.send({ type: 'join', contestantId });
  }

  leave(): boolean {
    return this.send({ type: 'leave' });
  }

  clearError(): void {
    this.error = null;
  }

  private send(message: Parameters<LiveConnection['send']>[0]): boolean {
    const ok = this.conn.send(message);
    if (!ok) this.error = { code: 'serverError', message: 'Nejsi připojený, zkouším to znovu…', at: Date.now() };
    return ok;
  }

  private onMessage(m: ServerMessage): void {
    if (m.type === 'welcome') {
      this.me = m.contestantId;
      this.error = null;
    } else if (m.type === 'state') {
      if (typeof m.now === 'number') this.offset = m.now - Date.now();
      this.view = m.view;
      this.presence = m.presence;
      if (m.view.viewer !== 'host') this.me = m.view.me;
      if (m.view.reveal?.length) {
        const add: Record<string, Question> = {};
        for (const r of m.view.reveal) if (!this.questions[r.question.id]) add[r.question.id] = r.question;
        if (Object.keys(add).length) this.questions = { ...this.questions, ...add };
      }
    } else if (m.type === 'error') {
      this.error = { code: m.code, message: m.message, at: Date.now() };
      if (m.code === 'kicked') this.me = null;
    }
  }
}
