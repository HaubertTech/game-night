// CLI: validates data/aktivity/<level>.json (or a directory given as the first argument).
// Run with Node type stripping: `node --disable-warning=ExperimentalWarning scripts/check-aktivity.ts [dir]`.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { formatAktivityReport, validateAktivityFiles } from '../src/lib/games/aktivity/rules.ts';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'data', 'aktivity'));

if (!existsSync(root)) {
  console.error(`[check-aktivity] directory not found: ${root}`);
  process.exit(1);
}

const files = readdirSync(root)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => ({ path: name, content: readFileSync(join(root, name), 'utf8') }));

const report = validateAktivityFiles(files);
console.log(formatAktivityReport(report));
process.exitCode = report.issues.some((i) => i.severity === 'error') || files.length === 0 ? 1 : 0;
