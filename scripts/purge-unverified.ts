// Removes unverified accounts older than 30 days (and households left without any manager),
// plus spent tokens and old invites. The server runs the same job once a day.
// `node scripts/purge-unverified.ts [--days N]`

import process from 'node:process';
import { closePool } from '../src/lib/server/db.ts';
import { purgeUnverified, UNVERIFIED_RETENTION_DAYS } from '../src/lib/server/services/retention.ts';

const i = process.argv.indexOf('--days');
const days = i > 0 ? Number(process.argv[i + 1]) : UNVERIFIED_RETENTION_DAYS;
if (!Number.isInteger(days) || days < 1) {
  console.error('[purge] --days must be a positive integer');
  process.exit(1);
}

try {
  const result = await purgeUnverified(days);
  console.log('[purge] done', { days, ...result });
} catch (err) {
  console.error('[purge] failed:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await closePool();
}
