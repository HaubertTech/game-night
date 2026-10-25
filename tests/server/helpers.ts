// Test helpers: an isolated household per test file, removed afterwards (cascade deletes the rest).

import { randomBytes } from 'node:crypto';
import { closePool } from '#lib/server/db.ts';
import type { Account } from '#lib/server/repo/accounts.ts';
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

export interface FakeEventOptions {
  body?: unknown;
  household?: Household | null;
  account?: Account | null;
  deviceHouseholdId?: number | null;
  params?: Record<string, string>;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  cookies?: FakeCookies;
  ip?: string;
}

/** Minimal RequestEvent for calling +server.ts handlers directly. */
export function fakeEvent(opts: FakeEventOptions = {}) {
  const url = new URL(opts.url ?? 'http://localhost/api/test');
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
  const request = new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
  return {
    request,
    url,
    params: opts.params ?? {},
    locals: { household: opts.household ?? null, account: opts.account ?? null, deviceHouseholdId: opts.deviceHouseholdId ?? null },
    cookies: opts.cookies ?? fakeCookies(),
    getClientAddress: () => opts.ip ?? '203.0.113.1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
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

/** Household with a manager account (password hashed for real, so it can log in). */
export async function makeManager(label = 'manager', opts: { password?: string; verified?: boolean; pin?: string } = {}) {
  const { createAccount } = await import('#lib/server/repo/accounts.ts');
  const { hashPassword, hashPin } = await import('#lib/server/auth.ts');
  const household = await createHousehold(`Test ${label} ${randomBytes(4).toString('hex')}`, opts.pin ? await hashPin(opts.pin) : null);
  const password = opts.password ?? 'heslo-pro-test-123';
  const email = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomBytes(4).toString('hex')}@example.test`;
  const account = await createAccount({ householdId: household.id, email, passwordHash: await hashPassword(password), termsVersion: 'test', verified: opts.verified ?? true });
  return { household, account, email, password };
}

/** Collects e-mails instead of sending them. */
export function captureMail() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return {
    sent,
    mailer: { send: async (m: { to: string; subject: string; text: string }) => void sent.push(m) },
    /** Token from the last link to `path` sent to `to`. */
    token(to: string, path: string): string {
      const mail = [...sent].reverse().find((m) => m.to === to && m.text.includes(path));
      const match = mail?.text.split(`${path}?token=`)[1]?.match(/^[A-Za-z0-9_-]+/);
      if (!match) throw new Error(`no ${path} link for ${to}`);
      return match[0];
    },
  };
}
