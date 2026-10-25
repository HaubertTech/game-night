import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { COOKIE_NAME, createSessionToken } from '#lib/server/auth.ts';
import { query } from '#lib/server/db.ts';
import { clientIp, csrfViolation, isSecureRequest, securityHeaders, wsOriginAllowed } from '#lib/server/security.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { handle } from '../../src/hooks.server.ts';
import { cleanup, fakeCookies, fakeEvent, makeManager } from './helpers.ts';

const created: Household[] = [];
afterEach(() => {
  delete process.env.PUBLIC_ORIGIN;
  delete process.env.TRUST_PROXY;
});

describe('CSRF (Origin / Referer)', () => {
  const ev = (method: string, headers: Record<string, string>) => fakeEvent({ method, url: 'http://localhost:5180/api/players', headers, body: method === 'GET' ? undefined : {} });

  it('lets same-origin requests and requests without Origin/Referer (non-browser) through', () => {
    expect(csrfViolation(ev('POST', { origin: 'http://localhost:5180' }))).toBeNull();
    expect(csrfViolation(ev('POST', {}))).toBeNull();
    expect(csrfViolation(ev('DELETE', { referer: 'http://localhost:5180/hraci' }))).toBeNull();
  });

  it('refuses a foreign Origin or Referer on POST, PATCH and DELETE', () => {
    expect(csrfViolation(ev('POST', { origin: 'https://evil.example' }))).toMatch(/evil/);
    expect(csrfViolation(ev('PATCH', { referer: 'https://evil.example/x' }))).toMatch(/evil/);
    expect(csrfViolation(ev('DELETE', { origin: 'null' }))).not.toBeNull();
  });

  it('ignores safe methods', () => {
    expect(csrfViolation(ev('GET', { origin: 'https://evil.example' }))).toBeNull();
  });

  it('accepts PUBLIC_ORIGIN behind a proxy', () => {
    process.env.PUBLIC_ORIGIN = 'https://liga.example.cz';
    expect(csrfViolation(ev('POST', { origin: 'https://liga.example.cz' }))).toBeNull();
  });
});

describe('WebSocket origin', () => {
  it('accepts the own host, PUBLIC_ORIGIN and clients without Origin', () => {
    expect(wsOriginAllowed('http://192.168.1.5:3000', '192.168.1.5:3000')).toBe(true);
    expect(wsOriginAllowed(undefined, 'x')).toBe(true);
    process.env.PUBLIC_ORIGIN = 'https://liga.example.cz';
    expect(wsOriginAllowed('https://liga.example.cz', '127.0.0.1:3000')).toBe(true);
  });

  it('refuses a foreign page', () => {
    expect(wsOriginAllowed('https://evil.example', 'localhost:5180')).toBe(false);
    expect(wsOriginAllowed('garbage', 'localhost:5180')).toBe(false);
  });
});

describe('proxy awareness', () => {
  it('trusts X-Forwarded-For and -Proto only with TRUST_PROXY', () => {
    const ev = fakeEvent({ headers: { 'x-forwarded-for': '1.1.1.1, 9.9.9.9', 'x-forwarded-proto': 'https' }, ip: '127.0.0.1' });
    expect(clientIp(ev)).toBe('127.0.0.1');
    expect(isSecureRequest(ev)).toBe(false);
    process.env.TRUST_PROXY = '1';
    expect(clientIp(ev)).toBe('9.9.9.9');
    expect(isSecureRequest(ev)).toBe(true);
  });

  it('adds HSTS only over HTTPS and switches the microphone off', () => {
    expect(securityHeaders(false)['strict-transport-security']).toBeUndefined();
    expect(securityHeaders(true)['strict-transport-security']).toMatch(/max-age/);
    expect(securityHeaders(false)['permissions-policy']).toContain('microphone=()');
    expect(securityHeaders(false)['x-content-type-options']).toBe('nosniff');
  });
});

describe('hooks', () => {
  const resolve = async () => new Response('ok');

  it('sets the security headers and refuses a cross-site POST with 403', async () => {
    const ok = await handle({ event: fakeEvent({ url: 'http://localhost/api/me' }), resolve } as never);
    expect(ok.headers.get('referrer-policy')).toBe('same-origin');
    expect(ok.headers.get('x-frame-options')).toBe('DENY');
    expect(ok.headers.get('cache-control')).toBe('no-store');
    const bad = await handle({ event: fakeEvent({ url: 'http://localhost/api/players', body: {}, headers: { origin: 'https://evil.example' } }), resolve } as never);
    expect(bad.status).toBe(403);
  });

  it('ends an account session after a password change (session version)', async () => {
    const m = await makeManager('hooks');
    created.push(m.household);
    const cookies = fakeCookies();
    cookies.set(COOKIE_NAME, createSessionToken({ householdId: m.household.id, accountId: m.account.id, sessionVersion: m.account.session_version }), {});
    const event = fakeEvent({ url: 'http://localhost/api/me', cookies });
    await handle({ event, resolve } as never);
    expect(event.locals.account?.id).toBe(m.account.id);
    await query('UPDATE accounts SET session_version = session_version + 1 WHERE id = $1', [m.account.id]);
    const later = fakeEvent({ url: 'http://localhost/api/me', cookies });
    await handle({ event: later, resolve } as never);
    expect(later.locals.household).toBeNull();
    expect(cookies.jar.has(COOKIE_NAME)).toBe(false);
    await cleanup(created);
  });
});
