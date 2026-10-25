// SQL migration runner: applies db/migrations/NNN_*.sql in order, each in its own transaction,
// and records them in schema_migrations. Safe to run repeatedly and concurrently (advisory lock).

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { databaseName } from './env.ts';

const LOCK_KEY = 4_242_001;

export const MIGRATIONS_DIR = resolve(import.meta.dirname, '..', '..', '..', 'db', 'migrations');

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export function listMigrations(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
}

/** Creates the database from the URL if it does not exist (connects to the `postgres` maintenance DB). */
export async function ensureDatabase(url: string): Promise<boolean> {
  const name = databaseName(url);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount) return false;
    await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    console.log('[migrate] database created', { name });
    return true;
  } catch (err) {
    // A parallel runner may have created it in the meantime.
    if ((err as { code?: string }).code === '42P04') return false;
    throw err;
  } finally {
    await client.end();
  }
}

export async function migrate(url: string, dir = MIGRATIONS_DIR): Promise<MigrateResult> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const result: MigrateResult = { applied: [], skipped: [] };
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const file of listMigrations(dir)) {
      if (done.has(file)) {
        result.skipped.push(file);
        continue;
      }
      const sql = readFileSync(join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`[migrate] ${file} failed: ${(err as Error).message}`);
      }
      result.applied.push(file);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
  return result;
}
