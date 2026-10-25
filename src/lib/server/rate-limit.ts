// In-memory sliding-window rate limiter. One process only: a restart resets it, and several
// app instances would each count on their own (see docs/PROVOZ.md).

export interface RateLimitResult {
  ok: boolean;
  /** How long until the next attempt is allowed (0 when ok). */
  retryAfterMs: number;
  remaining: number;
}

export interface SlidingWindowOptions {
  limit: number;
  windowMs: number;
  clock?: () => number;
  /** Prune idle keys once the map grows above this. */
  maxKeys?: number;
}

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  readonly limit: number;
  readonly windowMs: number;
  private readonly clock: () => number;
  private readonly maxKeys: number;

  constructor(options: SlidingWindowOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.clock = options.clock ?? Date.now;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  private recent(key: string, now: number): number[] {
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Would another attempt pass? Does not count it. */
  check(key: string): RateLimitResult {
    const now = this.clock();
    const list = this.recent(key, now);
    if (list.length < this.limit) return { ok: true, retryAfterMs: 0, remaining: this.limit - list.length };
    return { ok: false, retryAfterMs: Math.max(1, list[0] + this.windowMs - now), remaining: 0 };
  }

  /** Counts an attempt; refused attempts are not counted (an attacker cannot extend the window forever). */
  hit(key: string): RateLimitResult {
    const result = this.check(key);
    if (!result.ok) return result;
    const now = this.clock();
    const list = this.hits.get(key) ?? [];
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > this.maxKeys) this.prune(now);
    return { ...result, remaining: result.remaining - 1 };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  clear(): void {
    this.hits.clear();
  }

  size(): number {
    return this.hits.size;
  }

  private prune(now: number): void {
    for (const key of [...this.hits.keys()]) this.recent(key, now);
  }
}

const MINUTE = 60_000;

/** Limits per action. `ip` counts per client address, `subject` per e-mail/account/household. */
export const RATE_LIMITS = {
  login: { ip: { limit: 20, windowMs: 15 * MINUTE }, subject: { limit: 8, windowMs: 15 * MINUTE } },
  pin: { ip: { limit: 20, windowMs: 15 * MINUTE }, subject: { limit: 10, windowMs: 15 * MINUTE } },
  register: { ip: { limit: 5, windowMs: 60 * MINUTE }, subject: { limit: 3, windowMs: 60 * MINUTE } },
  recovery: { ip: { limit: 5, windowMs: 60 * MINUTE }, subject: { limit: 3, windowMs: 60 * MINUTE } },
  invite: { ip: { limit: 20, windowMs: 60 * MINUTE }, subject: { limit: 10, windowMs: 60 * MINUTE } },
  /** Using a link from an e-mail (verify, new password, invite): the tokens are 256 bits, this only stops floods. */
  token: { ip: { limit: 30, windowMs: 60 * MINUTE }, subject: { limit: 10, windowMs: 60 * MINUTE } },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

const REGISTRY_KEY = Symbol.for('domaci-liga.rate-limiters');

type Registry = Record<RateLimitAction, { ip: SlidingWindowLimiter; subject: SlidingWindowLimiter }>;

/** Process-wide limiters (dev loads modules twice, see ws.ts). */
export function limiters(): Registry {
  const g = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };
  g[REGISTRY_KEY] ??= Object.fromEntries(
    Object.entries(RATE_LIMITS).map(([action, cfg]) => [action, { ip: new SlidingWindowLimiter(cfg.ip), subject: new SlidingWindowLimiter(cfg.subject) }]),
  ) as Registry;
  return g[REGISTRY_KEY];
}

/** Tests: forget all counted attempts. */
export function resetRateLimits(): void {
  for (const l of Object.values(limiters())) {
    l.ip.clear();
    l.subject.clear();
  }
}

/**
 * Counts one attempt of `action` for the IP and (optionally) the subject.
 * Returns the refusal (with retry time) or null when the attempt may go on.
 */
export function takeAttempt(action: RateLimitAction, ip: string, subject?: string | null): RateLimitResult | null {
  const l = limiters()[action];
  const byIp = l.ip.check(ip);
  const bySubject = subject ? l.subject.check(subject) : null;
  if (!byIp.ok) return byIp;
  if (bySubject && !bySubject.ok) return bySubject;
  l.ip.hit(ip);
  if (subject) l.subject.hit(subject);
  return null;
}
