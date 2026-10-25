// Node-side question loader: reads data/questions/**/*.json with node:fs and applies the same
// verified filter as the Vite loader (shared via question-pool.ts).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import type { Question } from '../types.ts';
import { loadQuestions, type LoadOptions, type Modules } from '../question-pool.ts';

/** Default dataset directory; QUESTIONS_DIR overrides it (e.g. tests/fixtures/questions). */
export function defaultQuestionsDir(): string {
  return resolve(process.env.QUESTIONS_DIR ?? join(process.cwd(), 'data', 'questions'));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.json')) out.push(full);
  }
  return out;
}

/** Reads every JSON file under `dir`. Unparsable files are skipped with a warning, never thrown. */
export function readQuestionModules(dir: string): Modules {
  const modules: Modules = {};
  if (!existsSync(dir)) {
    console.warn('[questions-fs] directory not found', { dir });
    return modules;
  }
  for (const full of walk(dir)) {
    const key = relative(dir, full).split('\\').join('/');
    try {
      modules[key] = JSON.parse(readFileSync(full, 'utf8'));
    } catch (err) {
      console.warn('[questions-fs] skipping unreadable file', { file: key, err: (err as Error).message });
    }
  }
  return modules;
}

export function loadQuestionsFromDir(dir: string = defaultQuestionsDir(), options: LoadOptions = {}): Question[] {
  return loadQuestions(options, readQuestionModules(dir));
}
