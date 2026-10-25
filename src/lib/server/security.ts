// Request context behind an optional reverse proxy: client address, HTTPS, allowed origins,
// CSRF check and security headers.
//
// PUBLIC_ORIGIN  public address of the app (https://liga.example.cz); e-mail links, Origin checks, Secure cookies.
// TRUST_PROXY=1  the app sits behind a reverse proxy; X-Forwarded-For / X-Forwarded-Proto are trusted.
// XFF_DEPTH      how many proxies append to X-Forwarded-For (default 1).

import process from 'node:process';
import { error, type RequestEvent } from '@sveltejs/kit';
import { loadEnv } from './env.ts';
import { publicOrigin, trustProxy } from './origin.ts';
export { publicOrigin, trustProxy, wsOriginAllowed } from './origin.ts';
import { takeAttempt, type RateLimitAction } from './rate-limit.ts';

type Ev = Pick<RequestEvent, 'request' | 'url'> & { getClientAddress?: () => string };

function env(name: string): string | undefined {
  loadEnv();
  return process.env[name] || undefined;
}

export function clientIp(event: Ev): string {
  if (trustProxy()) {
    const xff = event.request.headers.get('x-forwarded-for');
    if (xff) {
      const hops = xff.split(',').map((s) => s.trim()).filter(Boolean);
      const depth = Math.max(1, Number(env('XFF_DEPTH') ?? 1) || 1);
      const ip = hops[Math.max(0, hops.length - depth)];
      if (ip) return ip;
    }
  }
  try {
    return event.getClientAddress?.() ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The browser talks HTTPS to us (directly, through a trusted proxy, or PUBLIC_ORIGIN says so). */
export function isSecureRequest(event: Pick<RequestEvent, 'request' | 'url'>): boolean {
  if (event.url.protocol === 'https:') return true;
  if (trustProxy() && event.request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https') return true;
  return publicOrigin()?.startsWith('https:') ?? false;
}

/** Origins allowed to send state-changing requests and open WebSockets. */
export function allowedOrigins(requestOrigin: string | null): string[] {
  const list = new Set<string>();
  const pub = publicOrigin();
  if (pub) list.add(pub);
  if (requestOrigin) list.add(requestOrigin);
  return [...list];
}

/** Base URL for links in e-mails. */
export function appOrigin(event: Pick<RequestEvent, 'url'>): string {
  return publicOrigin() ?? event.url.origin;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF: a state-changing request from a browser must come from our own origin. Browsers send
 * Origin on every cross-site POST/PATCH/DELETE; when both Origin and Referer are missing the
 * client is not a browser (curl, tests) and cannot ride on a victim's cookie.
 * SvelteKit's own `csrf` check only covers form content types, this one covers JSON too.
 */
export function csrfViolation(event: Pick<RequestEvent, 'request' | 'url'>): string | null {
  if (!UNSAFE.has(event.request.method)) return null;
  const allowed = allowedOrigins(event.url.origin);
  const origin = event.request.headers.get('origin');
  if (origin) return allowed.includes(origin) ? null : `origin ${origin}`;
  const referer = event.request.headers.get('referer');
  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin) ? null : `referer ${new URL(referer).origin}`;
    } catch {
      return 'bad referer';
    }
  }
  return null;
}

export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()';

/** Headers for every response (the CSP itself is set by SvelteKit, see vite.config.ts). */
export function securityHeaders(secure: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'permissions-policy': PERMISSIONS_POLICY,
    'x-frame-options': 'DENY',
    'cross-origin-opener-policy': 'same-origin',
  };
  if (secure) headers['strict-transport-security'] = 'max-age=31536000';
  return headers;
}

/** Throws 429 with a Czech message when the action is over its limit for this IP or subject. */
export function rateLimit(event: Ev, action: RateLimitAction, subject?: string | null): void {
  const refused = takeAttempt(action, clientIp(event), subject ? `${action}:${subject}` : null);
  if (refused) {
    const minutes = Math.max(1, Math.ceil(refused.retryAfterMs / 60_000));
    console.warn('[security] rate limited', { action, ip: clientIp(event) });
    error(429, `Příliš mnoho pokusů. Zkus to znovu za ${minutes} min.`);
  }
}
