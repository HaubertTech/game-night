// Maps service errors (ResultError) to SvelteKit HTTP errors with the Czech message.

import { error } from '@sveltejs/kit';
import { ResultError } from './results.ts';

export async function service<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ResultError) error(err.status, err.message);
    throw err;
  }
}

/** Optional positive integer from JSON (null/undefined → null). */
export function optionalId(value: unknown, what: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) error(400, `Neplatné ${what}.`);
  return n;
}
