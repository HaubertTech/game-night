// Loads the question dataset bundled at build time.
// VITE_QUESTIONS=fixtures swaps in tests/fixtures/questions so e2e does not depend on the big dataset.
// The filtering itself lives in question-pool.ts so the Node server can share it.

import type { Question } from './types.ts';
import * as pool from './question-pool.ts';
import type { LoadOptions, Modules } from './question-pool.ts';

export { countQuestions, type LoadOptions, type QuestionCounts } from './question-pool.ts';

const modules: Modules =
  import.meta.env.VITE_QUESTIONS === 'fixtures'
    ? import.meta.glob('/tests/fixtures/questions/**/*.json', { eager: true, import: 'default' })
    : import.meta.glob('/data/questions/**/*.json', { eager: true, import: 'default' });

/** Returns every well-formed question from the dataset (unknown shapes are skipped, never thrown). */
export function allQuestions(source: Modules = modules): Question[] {
  return pool.allQuestions(source);
}

export function loadQuestions(options: LoadOptions = {}, source: Modules = modules): Question[] {
  return pool.loadQuestions(options, source);
}
