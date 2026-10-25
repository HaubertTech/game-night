// Promise wrapper around the chess AI worker. Falls back to the main thread when workers are not
// available (old browsers, tests) — slower, but the game still works.

import { analyze, chooseMove, type SearchInput, type SearchOptions, type SearchResult } from '../../games/chess/ai.ts';
import type { AiRequest } from './ai.worker.ts';

type Pending = { resolve: (r: SearchResult) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let failed = false;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (worker || failed) return worker;
  try {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; result?: SearchResult; error?: string }>) => {
      const p = pending.get(event.data.id);
      if (!p) return;
      pending.delete(event.data.id);
      if (event.data.result) p.resolve(event.data.result);
      else p.reject(new Error(event.data.error ?? 'chess worker failed'));
    };
    worker.onerror = (event) => {
      console.warn('[chess] worker error, falling back to the main thread', { message: event.message });
      failed = true;
      worker?.terminate();
      worker = null;
      for (const p of pending.values()) p.reject(new Error('chess worker crashed'));
      pending.clear();
    };
  } catch (err) {
    console.warn('[chess] worker unavailable', { err: (err as Error).message });
    failed = true;
    worker = null;
  }
  return worker;
}

function run(req: Omit<AiRequest, 'id'>): Promise<SearchResult> {
  const w = getWorker();
  if (!w) {
    // Yield first so the UI can paint the "thinking" state.
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(req.kind === 'choose' ? chooseMove(req.input, req.options as SearchOptions) : analyze(req.input, req.options));
        } catch (err) {
          reject(err as Error);
        }
      }, 30),
    );
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...req, id } as AiRequest);
  });
}

export function aiMove(input: SearchInput, options: SearchOptions): Promise<SearchResult> {
  return run({ kind: 'choose', input, options });
}

export function aiAnalyze(input: SearchInput, options: { maxDepth?: number; timeMs?: number }): Promise<SearchResult> {
  return run({ kind: 'analyze', input, options });
}
