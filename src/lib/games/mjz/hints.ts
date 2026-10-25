// Known valid answers (data/mjz/hints/*.json) as a review aid: an answer found there is shown as
// "known", anything else as "unverified". It never decides validity — players and the host do.

import { normalizeAnswer, type MjzCategory } from './engine.ts';

export interface HintFile {
  /** File key, e.g. "mesta"; categories refer to it in `hints`. */
  key: string;
  label: string;
  source: string;
  /** Initial letter ("A" … "Ž", "Ch") → answers. */
  byLetter: Record<string, string[]>;
}

/** Hint key → normalized answers. */
export type HintIndex = Map<string, Set<string>>;

export function buildHintIndex(files: readonly HintFile[]): HintIndex {
  const index: HintIndex = new Map();
  for (const f of files) {
    const set = index.get(f.key) ?? new Set<string>();
    for (const words of Object.values(f.byLetter ?? {})) for (const w of words) set.add(normalizeAnswer(w));
    index.set(f.key, set);
  }
  return index;
}

/** true = known answer, false = not in the hints, null = the category has no hints. */
export function isKnownAnswer(index: HintIndex | undefined, category: MjzCategory | undefined, text: string): boolean | null {
  const keys = (category?.hints ?? []).filter((k) => index?.has(k));
  if (!index || keys.length === 0) return null;
  const n = normalizeAnswer(text);
  return keys.some((k) => index.get(k)!.has(n));
}
