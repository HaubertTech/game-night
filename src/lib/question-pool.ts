// Pure question filtering shared by the Vite loader (questions.ts, import.meta.glob) and the
// Node loader (server/questions-fs.ts, node:fs). No bundler- or runtime-specific API here.

import type { Level, Question, Theme } from './types.ts';
import { LEVELS, THEMES } from './types.ts';

/** Dataset files keyed by path; each value should be an array of questions. */
export type Modules = Record<string, unknown>;

export function isQuestion(value: unknown): value is Question {
  if (!value || typeof value !== 'object') return false;
  const q = value as Record<string, unknown>;
  return (
    typeof q.id === 'string' &&
    typeof q.text === 'string' &&
    LEVELS.includes(q.level as Level) &&
    THEMES.includes(q.theme as Theme) &&
    (q.type === 'choice' ? Array.isArray(q.options) && typeof q.answer === 'string'
      : q.type === 'estimate' ? typeof q.answer === 'number'
      : q.type === 'open' ? typeof q.answer === 'string'
      : false)
  );
}

/** Returns every well-formed question from the dataset (unknown shapes are skipped, never thrown). */
export function allQuestions(source: Modules): Question[] {
  const out: Question[] = [];
  const ids = new Set<string>();
  for (const content of Object.values(source)) {
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (isQuestion(item) && !ids.has(item.id)) {
        ids.add(item.id);
        out.push(item);
      }
    }
  }
  return out;
}

export interface LoadOptions {
  /** Include `status: "draft"` questions (dev only, `?draft=1`). */
  includeDraft?: boolean;
}

export function loadQuestions(options: LoadOptions, source: Modules): Question[] {
  return allQuestions(source).filter((q) => q.status === 'verified' || (options.includeDraft && q.status === 'draft'));
}

export type QuestionCounts = Record<Level, Partial<Record<Theme, number>> & { total: number }>;

export function countQuestions(questions: Question[]): QuestionCounts {
  const counts = Object.fromEntries(LEVELS.map((l) => [l, { total: 0 }])) as QuestionCounts;
  for (const q of questions) {
    const c = counts[q.level];
    c.total++;
    c[q.theme] = (c[q.theme] ?? 0) + 1;
  }
  return counts;
}
