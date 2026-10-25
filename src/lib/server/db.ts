// Postgres access: one lazily created pool, thin helpers, transactions.

import process from 'node:process';
import pg from 'pg';
import { databaseName, requireEnv } from './env.ts';

export type Queryable = Pick<pg.PoolClient, 'query'>;

let pool: pg.Pool | null = null;

// BIGINT ids arrive as strings by default; ours fit into a JS number comfortably.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
// DATE stays a plain 'YYYY-MM-DD' string (no timezone shift).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export function getPool(): pg.Pool {
  if (pool) return pool;
  const url = requireEnv('DATABASE_URL');
  if (process.env.VITEST && !databaseName(url).includes('_test')) {
    throw new Error('[db] tests must run against a database with `_test` in its name');
  }
  pool = new pg.Pool({ connectionString: url, max: 10 });
  pool.on('error', (err) => console.error('[db] idle client error', { err: err.message }));
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client: Queryable = getPool(),
): Promise<T[]> {
  try {
    const res = await client.query<T>(sql, params);
    return res.rows;
  } catch (err) {
    console.error('[db] query failed', { sql: sql.slice(0, 120), err: (err as Error).message });
    throw err;
  }
}

/** First row or null. */
export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client: Queryable = getPool(),
): Promise<T | null> {
  const rows = await query<T>(sql, params, client);
  return rows[0] ?? null;
}

/** Runs `fn` in a transaction; rolls back when it throws. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}
