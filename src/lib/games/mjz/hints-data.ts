// Bundles data/mjz/hints/*.json at build time (Vite). Pure helpers live in hints.ts.

import { buildHintIndex, type HintFile, type HintIndex } from './hints.ts';

const modules = import.meta.glob('/data/mjz/hints/*.json', { eager: true, import: 'default' }) as Record<string, HintFile>;

let cached: HintIndex | null = null;

export function hintFiles(): HintFile[] {
  return Object.values(modules);
}

export function loadHintIndex(): HintIndex {
  cached ??= buildHintIndex(hintFiles());
  return cached;
}
