// Generates data/chess/puzzles.json from random sparse positions (seeded, own data — no external
// puzzle database). Keeps only positions with a single solving move.
// Run: node --disable-warning=ExperimentalWarning tests/games/chess/generate-puzzles.ts

import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { mulberry32 } from '../../../src/lib/games/chess/ai.ts';
import { PIECE_NAME } from '../../../src/lib/games/chess/learn/hints.ts';
import { checkMaterialPuzzle, matingMoves, type Puzzle, type PuzzleKind } from '../../../src/lib/games/chess/learn/puzzles.ts';

const TARGET: Record<PuzzleKind, number> = { mate1: 30, material: 15, fork: 15 };
const rand = mulberry32(20261025);


function randomFen(): string | null {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const free = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8 && !board[r][f];
  const place = (piece: string, rMin: number, rMax: number): boolean => {
    for (let i = 0; i < 20; i++) {
      const r = rMin + Math.floor(rand() * (rMax - rMin + 1));
      const f = Math.floor(rand() * 8);
      if (free(r, f)) {
        board[r][f] = piece;
        return true;
      }
    }
    return false;
  };
  // rank index 0 = rank 8. Black king near the top, white king near the bottom.
  place('k', 0, 2);
  place('K', 5, 7);
  // A few pawns in front of the black king (back-rank patterns).
  for (let i = 0; i < Math.floor(rand() * 4); i++) place('p', 1, 3);
  for (let i = 0; i < Math.floor(rand() * 3); i++) place('P', 4, 6);
  const whites = ['Q', 'R', 'R', 'B', 'N', 'N', 'B'];
  const blacks = ['q', 'r', 'r', 'b', 'n', 'n', 'b'];
  // Drawn without replacement: at most one queen per side, like in a real game.
  for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) place(whites.splice(Math.floor(rand() * whites.length), 1)[0], 0, 7);
  for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) place(blacks.splice(Math.floor(rand() * blacks.length), 1)[0], 0, 7);
  const rows = board.map((row) => {
    let s = '';
    let empty = 0;
    for (const c of row) {
      if (!c) empty++;
      else {
        if (empty) s += empty;
        empty = 0;
        s += c;
      }
    }
    return s + (empty || '');
  });
  const fen = `${rows.join('/')} w - - 0 1`;
  try {
    const chess = new Chess(fen);
    if (chess.inCheck() || chess.isGameOver()) return null;
    // Black must not be in check with white to move (illegal position).
    const flipped = new Chess(fen.replace(' w ', ' b '));
    if (flipped.inCheck()) return null;
    return fen;
  } catch {
    return null;
  }
}

function pieceCount(fen: string): number {
  return fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
}

function difficulty(fen: string): 1 | 2 | 3 {
  const n = pieceCount(fen);
  return n <= 6 ? 1 : n <= 9 ? 2 : 3;
}

function hintFor(fen: string, uci: string): string {
  const piece = new Chess(fen).get(uci.slice(0, 2) as never);
  return piece ? `Zkus to ${PIECE_NAME[piece.type].ins}.` : 'Dívej se pozorně.';
}

const found: Record<PuzzleKind, Puzzle[]> = { mate1: [], material: [], fork: [] };
const seen = new Set<string>();
let tries = 0;
while ((found.mate1.length < TARGET.mate1 || found.material.length < TARGET.material || found.fork.length < TARGET.fork) && tries < 400_000) {
  tries++;
  const fen = randomFen();
  if (!fen || seen.has(fen)) continue;
  seen.add(fen);
  const mates = matingMoves(fen);
  if (mates.length === 1) {
    if (found.mate1.length < TARGET.mate1) found.mate1.push({ id: '', kind: 'mate1', fen, solution: mates, hint: hintFor(fen, mates[0]), difficulty: difficulty(fen) });
    continue;
  }
  if (mates.length) continue;
  if (found.material.length >= TARGET.material && found.fork.length >= TARGET.fork) continue;
  const check = checkMaterialPuzzle(fen);
  if (!check.unique || !check.best) continue;
  const kind: PuzzleKind = check.fork ? 'fork' : 'material';
  if (found[kind].length >= TARGET[kind]) continue;
  found[kind].push({ id: '', kind, fen, solution: [check.best], hint: hintFor(fen, check.best), difficulty: difficulty(fen) });
  console.log('[puzzles]', kind, found[kind].length, fen, check.best);
}

const puzzles = (['mate1', 'fork', 'material'] as const).flatMap((kind) =>
  found[kind].sort((a, b) => pieceCount(a.fen) - pieceCount(b.fen)).map((p, i) => ({ ...p, id: `${kind}-${String(i + 1).padStart(2, '0')}` })),
);
writeFileSync('data/chess/puzzles.json', JSON.stringify({ version: 1, puzzles }, null, 2) + '\n');
console.log('[puzzles] written', { tries, mate1: found.mate1.length, material: found.material.length, fork: found.fork.length, });
