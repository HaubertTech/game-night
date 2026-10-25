import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMITS, resetRateLimits, SlidingWindowLimiter, takeAttempt } from '#lib/server/rate-limit.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { POST as loginRoute } from '../../src/routes/api/auth/login/+server.ts';
import { POST as pinRoute } from '../../src/routes/api/login/+server.ts';
import { POST as register } from '../../src/routes/api/auth/register/+server.ts';
import { POST as resetRequest } from '../../src/routes/api/auth/reset/request/+server.ts';
import { cleanup, fakeEvent, httpError, makeManager } from './helpers.ts';

const created: Household[] = [];
afterAll(() => cleanup(created));
beforeEach(() => resetRateLimits());

describe('SlidingWindowLimiter', () => {
  it('allows `limit` hits per window and refuses the next one', () => {
    let now = 1_000_000;
    const l = new SlidingWindowLimiter({ limit: 3, windowMs: 60_000, clock: () => now });
    expect([l.hit('k').ok, l.hit('k').ok, l.hit('k').ok]).toEqual([true, true, true]);
    const refused = l.hit('k');
    expect(refused.ok).toBe(false);
    expect(refused.retryAfterMs).toBe(60_000);
    now += 30_000;
    expect(l.hit('k').ok).toBe(false);
    expect(l.check('k').retryAfterMs).toBe(30_000);
  });

  it('slides: the oldest hit leaves the window first', () => {
    let now = 0;
    const l = new SlidingWindowLimiter({ limit: 2, windowMs: 10_000, clock: () => now });
    l.hit('k');
    now = 6_000;
    l.hit('k');
    now = 10_001; // first hit is out, second still in
    expect(l.hit('k').ok).toBe(true);
    expect(l.hit('k').ok).toBe(false);
  });

  it('does not count refused attempts and keeps keys apart', () => {
    let now = 0;
    const l = new SlidingWindowLimiter({ limit: 1, windowMs: 1_000, clock: () => now });
    l.hit('a');
    for (let i = 0; i < 10; i++) l.hit('a');
    now = 1_001;
    expect(l.hit('a').ok).toBe(true);
    expect(l.hit('b').ok).toBe(true);
  });

  it('forgets idle keys when pruning', () => {
    let now = 0;
    const l = new SlidingWindowLimiter({ limit: 1, windowMs: 1_000, clock: () => now, maxKeys: 2 });
    l.hit('a');
    l.hit('b');
    now = 5_000;
    l.hit('c');
    expect(l.size()).toBe(1);
  });
});

describe('takeAttempt', () => {
  it('limits by IP and by subject independently', () => {
    const { ip, subject } = RATE_LIMITS.login;
    for (let i = 0; i < subject.limit; i++) expect(takeAttempt('login', `10.0.0.${i}`, 'login:a@b.cz')).toBeNull();
    expect(takeAttempt('login', '10.0.1.1', 'login:a@b.cz')).not.toBeNull();
    resetRateLimits();
    for (let i = 0; i < ip.limit; i++) expect(takeAttempt('login', '10.0.0.1', `login:${i}@b.cz`)).toBeNull();
    expect(takeAttempt('login', '10.0.0.1', 'login:new@b.cz')).not.toBeNull();
  });
});

describe('routes answer 429 over the limit', () => {
  it('password login per account, also from changing IPs', async () => {
    const m = await makeManager('rate');
    created.push(m.household);
    const attempt = (ip: string) => httpError(() => loginRoute(fakeEvent({ body: { email: m.email, password: 'spatne-heslo-9' }, ip })));
    for (let i = 0; i < RATE_LIMITS.login.subject.limit; i++) expect((await attempt(`192.0.2.${i}`)).status).toBe(401);
    const blocked = await attempt('192.0.2.200');
    expect(blocked.status).toBe(429);
    expect(blocked.message).toMatch(/Příliš mnoho pokusů/);
    // Even the right password waits until the window passes.
    expect((await httpError(() => loginRoute(fakeEvent({ body: { email: m.email, password: m.password }, ip: '192.0.2.201' })))).status).toBe(429);
  });

  it('PIN login per IP', async () => {
    for (let i = 0; i < RATE_LIMITS.pin.ip.limit; i++) await httpError(() => pinRoute(fakeEvent({ body: { pin: '0000', name: `nikdo ${i}` }, ip: '198.51.100.7' })));
    expect((await httpError(() => pinRoute(fakeEvent({ body: { pin: '0000' }, ip: '198.51.100.7' })))).status).toBe(429);
  });

  it('registration and password recovery per IP', async () => {
    for (let i = 0; i < RATE_LIMITS.register.ip.limit; i++) await httpError(() => register(fakeEvent({ body: { email: 'neplatny' }, ip: '203.0.113.9' })));
    expect((await httpError(() => register(fakeEvent({ body: { email: 'neplatny' }, ip: '203.0.113.9' })))).status).toBe(429);
    for (let i = 0; i < RATE_LIMITS.recovery.ip.limit; i++) await resetRequest(fakeEvent({ body: { email: `x${i}@example.test` }, ip: '203.0.113.10' }));
    expect((await httpError(() => resetRequest(fakeEvent({ body: { email: 'y@example.test' }, ip: '203.0.113.10' })))).status).toBe(429);
  });
});
