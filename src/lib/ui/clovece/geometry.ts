// Board layout of Člověče, nezlob se on an 11 × 11 grid: the 40 ring fields clockwise from red's
// start (left arm), the four home rows towards the centre, the yards in the corners. Colours and
// shapes of the four players (muted palette of app.css, different lightness + a shape on every
// pawn and home field, so the colours can be told apart without seeing colour).

import { COLOR_SHAPES, fieldOf, TRACK, YARD, type CloveceColor } from '../../games/clovece/engine.ts';

export type Cell = [x: number, y: number];

/** Ring field n → grid cell. Field 0 = red start, 10 = blue, 20 = green, 30 = yellow. */
export const RING: readonly Cell[] = [
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],
  [4, 3], [4, 2], [4, 1], [4, 0],
  [5, 0], [6, 0],
  [6, 1], [6, 2], [6, 3], [6, 4],
  [7, 4], [8, 4], [9, 4], [10, 4],
  [10, 5], [10, 6],
  [9, 6], [8, 6], [7, 6], [6, 6],
  [6, 7], [6, 8], [6, 9], [6, 10],
  [5, 10], [4, 10],
  [4, 9], [4, 8], [4, 7], [4, 6],
  [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 5],
];

export const HOME_CELLS: Record<CloveceColor, readonly Cell[]> = {
  red: [[1, 5], [2, 5], [3, 5], [4, 5]],
  blue: [[5, 1], [5, 2], [5, 3], [5, 4]],
  green: [[9, 5], [8, 5], [7, 5], [6, 5]],
  yellow: [[5, 9], [5, 8], [5, 7], [5, 6]],
};

export const YARD_CELLS: Record<CloveceColor, readonly Cell[]> = {
  red: [[0, 0], [1, 0], [0, 1], [1, 1]],
  blue: [[9, 0], [10, 0], [9, 1], [10, 1]],
  green: [[9, 9], [10, 9], [9, 10], [10, 10]],
  yellow: [[0, 9], [1, 9], [0, 10], [1, 10]],
};

/** Fill of pawns and fields, a darker edge, and a light tint for the yard and home fields. */
export const COLOR_STYLE: Record<CloveceColor, { fill: string; edge: string; tint: string; mark: string }> = {
  red: { fill: '#a9533d', edge: '#6e3326', tint: '#f0d5cb', mark: '#fbf8f1' },
  blue: { fill: '#4d6a8a', edge: '#2f445b', tint: '#d6e0ea', mark: '#fbf8f1' },
  green: { fill: '#7f9a5f', edge: '#4d6136', tint: '#e1e9d4', mark: '#2b3320' },
  yellow: { fill: '#dcb453', edge: '#8a6b20', tint: '#f6ebc9', mark: '#3b332b' },
};

/** Grid cell of a pawn at a relative position (yard slot = pawn index). */
export function cellOf(color: CloveceColor, rel: number, pawn: number): Cell {
  if (rel === YARD) return YARD_CELLS[color][pawn % 4] as Cell;
  if (rel >= TRACK) return HOME_CELLS[color][Math.min(rel - TRACK, 3)] as Cell;
  return RING[fieldOf(color, rel)!] as Cell;
}

/** Relative positions a pawn passes through from `from` to `to` (for the step animation). */
export function pathOf(from: number, to: number): number[] {
  if (from === YARD) return [0];
  const out: number[] = [];
  for (let r = from + 1; r <= to; r++) out.push(r);
  return out;
}

export { COLOR_SHAPES };

/** SVG path of a shape centred on 0,0 with radius r. */
export function shapePath(shape: (typeof COLOR_SHAPES)[CloveceColor], r: number): string {
  switch (shape) {
    case 'circle':
      return `M ${-r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    case 'square':
      return `M ${-r * 0.85} ${-r * 0.85} H ${r * 0.85} V ${r * 0.85} H ${-r * 0.85} Z`;
    case 'triangle':
      return `M 0 ${-r} L ${r * 0.95} ${r * 0.75} L ${-r * 0.95} ${r * 0.75} Z`;
    case 'diamond':
      return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
  }
}

/** Arrow on each start field pointing along the direction of play. */
export function startArrow(color: CloveceColor): { cell: Cell; angle: number } {
  const angle = { red: 0, blue: 90, green: 180, yellow: 270 }[color];
  return { cell: RING[{ red: 0, blue: 10, green: 20, yellow: 30 }[color]] as Cell, angle };
}
