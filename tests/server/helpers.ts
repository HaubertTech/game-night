// Test helpers: an isolated household per test file, removed afterwards (cascade deletes the rest).

import { randomBytes } from 'node:crypto';
import { closePool } from '#lib/server/db.ts';
import { createHousehold, deleteHousehold, type Household } from '#lib/server/repo/households.ts';

export async function makeHousehold(label = 'test'): Promise<Household> {
  return createHousehold(`Test ${label} ${randomBytes(4).toString('hex')}`, 'scrypt$x$y');
}

export async function cleanup(households: Household[]): Promise<void> {
  for (const h of households) await deleteHousehold(h.id);
  await closePool();
}

export interface FakeCookies {
  jar: Map<string, { value: string; opts: Record<string, unknown> }>;
  get(name: string): string | undefined;
  set(name: string, value: string, opts: Record<string, unknown>): void;
  delete(name: string, opts: Record<string, unknown>): void;
}

export function fakeCookies(): FakeCookies {
  const jar = new Map<string, { value: string; opts: Record<string, unknown> }>();
  return {
    jar,
    get: (name) => jar.get(name)?.value,
    set: (name, value, opts) => void jar.set(name, { value, opts }),
    delete: (name) => void jar.delete(name),
  };
}

/** Minimal RequestEvent for calling +server.ts handlers directly. */
export function fakeEvent(opts: { body?: unknown; household?: Household | null; params?: Record<string, string>; url?: string; cookies?: FakeCookies } = {}) {
  const url = new URL(opts.url ?? 'http://localhost/api/test');
  const request = new Request(url, {
    method: opts.body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { request, url, params: opts.params ?? {}, locals: { household: opts.household ?? null }, cookies: opts.cookies ?? fakeCookies() } as any;
}

/** Runs a handler expected to throw a SvelteKit HttpError; returns its status and message. */
export async function httpError(fn: () => unknown): Promise<{ status: number; message: string }> {
  try {
    await fn();
  } catch (err) {
    const e = err as { status?: number; body?: { message?: string } };
    if (typeof e.status === 'number') return { status: e.status, message: e.body?.message ?? '' };
    throw err;
  }
  throw new Error('expected an HttpError');
}
