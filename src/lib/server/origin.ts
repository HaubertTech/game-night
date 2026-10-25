// Public origin and WebSocket origin check. No SvelteKit imports: ws.ts uses this under plain Node.

import process from 'node:process';
import { loadEnv } from './env.ts';

function env(name: string): string | undefined {
  loadEnv();
  return process.env[name] || undefined;
}

export function trustProxy(): boolean {
  return env('TRUST_PROXY') === '1' || env('TRUST_PROXY') === 'true';
}

/** Configured public origin without a trailing slash, or null. */
export function publicOrigin(): string | null {
  const raw = env('PUBLIC_ORIGIN');
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    console.warn('[security] PUBLIC_ORIGIN is not a valid URL', { value: raw });
    return null;
  }
}

/** WebSocket upgrade: Origin (when present) must be PUBLIC_ORIGIN or the host the request came to. */
export function wsOriginAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (origin === publicOrigin()) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Host the browser used: behind a trusted proxy X-Forwarded-Host, otherwise Host. */
export function requestHost(headers: Record<string, string | string[] | undefined>): string | undefined {
  const forwarded = trustProxy() ? headers['x-forwarded-host'] : undefined;
  const value = forwarded ?? headers.host;
  return (Array.isArray(value) ? value[0] : value)?.split(',')[0].trim();
}
