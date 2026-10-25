// Runs the chess search off the main thread so the board stays responsive while the computer thinks.

import { analyze, chooseMove, type SearchInput, type SearchOptions } from '../../games/chess/ai.ts';

export type AiRequest =
  | { id: number; kind: 'choose'; input: SearchInput; options: SearchOptions }
  | { id: number; kind: 'analyze'; input: SearchInput; options: { maxDepth?: number; timeMs?: number } };

self.onmessage = (event: MessageEvent<AiRequest>) => {
  const req = event.data;
  try {
    const result = req.kind === 'choose' ? chooseMove(req.input, req.options) : analyze(req.input, req.options);
    self.postMessage({ id: req.id, result });
  } catch (err) {
    self.postMessage({ id: req.id, error: (err as Error).message });
  }
};
