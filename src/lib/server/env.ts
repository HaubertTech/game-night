// Server environment. Vite does not expose non-VITE_ variables from .env to process.env,
// so the server loads .env itself (existing variables always win).

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = resolve(process.cwd(), '.env');
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch (err) {
      console.warn('[env] .env could not be loaded', { err: (err as Error).message });
    }
  }
}

export function requireEnv(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (!value) throw new Error(`[env] missing ${name} (see .env.example)`);
  return value;
}

/** Database name from a postgres:// URL. */
export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}
