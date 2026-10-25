// CLI: validates data/questions/**/*.json (or a directory given as the first argument).
// Run with Node type stripping: `node scripts/check-questions.ts [dir]`.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { formatReport, validateQuestionFiles, type QuestionFile } from './question-rules.ts';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'data', 'questions'));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.json')) out.push(full);
  }
  return out;
}

if (!existsSync(root)) {
  console.error(`[check-questions] directory not found: ${root}`);
  process.exit(1);
}

const files: QuestionFile[] = walk(root).map((full) => ({
  path: relative(root, full).split('\\').join('/'),
  content: readFileSync(full, 'utf8'),
}));

const result = validateQuestionFiles(files);
console.log(formatReport(result));
const errors = result.issues.filter((i) => i.severity === 'error').length;
if (files.length === 0) console.log('(žádné soubory s otázkami)');
process.exitCode = errors > 0 ? 1 : 0;
