// CLI: applies SQL migrations. `node scripts/migrate.ts` (DATABASE_URL) or `--test` (DATABASE_URL_TEST).

import process from 'node:process';
import { databaseName, requireEnv } from '../src/lib/server/env.ts';
import { ensureDatabase, migrate } from '../src/lib/server/migrate.ts';

const test = process.argv.includes('--test');
const url = requireEnv(test ? 'DATABASE_URL_TEST' : 'DATABASE_URL');
if (test && !databaseName(url).includes('_test')) {
  console.error('[migrate] DATABASE_URL_TEST must point to a database with `_test` in its name');
  process.exit(1);
}

try {
  await ensureDatabase(url);
  const { applied, skipped } = await migrate(url);
  console.log('[migrate] done', { database: databaseName(url), applied, skipped: skipped.length });
} catch (err) {
  console.error('[migrate] failed:', (err as Error).message);
  process.exit(1);
}
