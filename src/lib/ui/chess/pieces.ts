// Own chess piece drawings (100 × 100 units per square), simple shapes that stay readable on a
// phone. Every piece is a list of SVG elements; `detail` parts get the contrasting stroke.

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface PieceShape {
  kind: 'path' | 'circle' | 'rect' | 'line';
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rx?: number;
  /** Drawn as a thin contrasting line instead of a filled shape. */
  detail?: boolean;
}

const BASE: PieceShape = { kind: 'rect', x: 22, y: 76, w: 56, h: 11, rx: 5 };

export const PIECE_SHAPES: Record<PieceType, PieceShape[]> = {
  p: [
    { kind: 'path', d: 'M37 77 C37 62 43 54 50 50 C57 54 63 62 63 77 Z' },
    { kind: 'rect', x: 35, y: 45, w: 30, h: 8, rx: 4 },
    { kind: 'circle', cx: 50, cy: 33, r: 13 },
    BASE,
  ],
  r: [
    { kind: 'rect', x: 33, y: 40, w: 34, h: 34, rx: 2 },
    { kind: 'path', d: 'M27 20 H38 V28 H45 V20 H55 V28 H62 V20 H73 V40 H27 Z' },
    { kind: 'rect', x: 29, y: 66, w: 42, h: 10, rx: 3 },
    { kind: 'line', d: 'M33 48 H67', detail: true },
    BASE,
  ],
  b: [
    { kind: 'path', d: 'M41 56 L36 77 H64 L59 56 Z' },
    { kind: 'path', d: 'M50 17 C35 30 33 45 40 57 H60 C67 45 65 30 50 17 Z' },
    { kind: 'circle', cx: 50, cy: 13, r: 6 },
    { kind: 'line', d: 'M55 29 L46 42', detail: true },
    { kind: 'line', d: 'M40 63 H60', detail: true },
    BASE,
  ],
  n: [
    {
      kind: 'path',
      d: 'M68 77 L67 55 C67 33 58 21 45 17 L41 10 L36 19 C29 23 23 32 21 42 L19 51 C19 56 24 58 29 55 L37 49 C39 51 41 52 45 52 C40 58 34 66 32 77 Z',
    },
    { kind: 'circle', cx: 40, cy: 31, r: 3.5, detail: true },
    { kind: 'line', d: 'M52 22 C60 30 62 42 61 54', detail: true },
    BASE,
  ],
  q: [
    { kind: 'path', d: 'M20 31 L32 64 H68 L80 31 L67 47 L64 24 L57 45 L50 19 L43 45 L36 24 L33 47 Z' },
    { kind: 'circle', cx: 20, cy: 29, r: 5 },
    { kind: 'circle', cx: 36, cy: 22, r: 5 },
    { kind: 'circle', cx: 50, cy: 16, r: 5 },
    { kind: 'circle', cx: 64, cy: 22, r: 5 },
    { kind: 'circle', cx: 80, cy: 29, r: 5 },
    { kind: 'path', d: 'M32 63 L30 77 H70 L68 63 Z' },
    { kind: 'line', d: 'M33 70 H67', detail: true },
    BASE,
  ],
  k: [
    { kind: 'rect', x: 46, y: 8, w: 8, h: 26, rx: 2 },
    { kind: 'rect', x: 38, y: 15, w: 24, h: 8, rx: 2 },
    { kind: 'path', d: 'M29 77 L33 50 C33 40 41 35 50 35 C59 35 67 40 67 50 L71 77 Z' },
    { kind: 'line', d: 'M33 57 H67', detail: true },
    BASE,
  ],
};

export const PIECE_LABEL: Record<PieceType, string> = {
  p: 'pěšec',
  n: 'jezdec',
  b: 'střelec',
  r: 'věž',
  q: 'dáma',
  k: 'král',
};

export const PIECE_COLORS = {
  w: { fill: '#fbf8f1', stroke: '#3b332b', detail: '#8a7b6a' },
  b: { fill: '#4a3f35', stroke: '#241d17', detail: '#e8dcc8' },
} as const;

export interface BoardMove {
  from: string;
  to: string;
  promotion?: string;
}

export interface BoardMark {
  square: string;
  tone: 'hint' | 'danger' | 'good';
}
