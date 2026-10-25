// Creates and migrates the test database once per run. Refuses anything without `_test` in its name.

import { databaseName } from '../../src/lib/server/env.ts';
import { ensureDatabase, migrate } from '../../src/lib/server/migrate.ts';

export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('[test-db] DATABASE_URL_TEST is not set (copy .env.example to .env)');
  if (!databaseName(url).includes('_test')) throw new Error(`[test-db] refusing to run against "${databaseName(url)}" — the name must contain _test`);
  try {
    await ensureDatabase(url);
    await migrate(url);
  } catch (err) {
    throw new Error(`[test-db] test database not available (npm run db:up?): ${(err as Error).message}`);
  }
}
