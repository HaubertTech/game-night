// Fast 0x88 board for the computer opponent. chess.js stays the rule authority for the game
// itself; this module exists because the search needs make/unmake at ~10^5–10^6 nodes per second.
// Pieces: positive = white, negative = black (1 pawn … 6 king). Square = rank * 16 + file (a1 = 0).

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const FLAG_CAPTURE = 1;
export const FLAG_EP = 2;
export const FLAG_CASTLE = 4;
export const FLAG_DOUBLE = 8;

const KNIGHT_DIRS = [33, 31, 18, 14, -33, -31, -18, -14];
const BISHOP_DIRS = [15, 17, -15, -17];
const ROOK_DIRS = [16, -16, 1, -1];
const KING_DIRS = [15, 16, 17, 1, -1, -15, -16, -17];

const PIECE_CHARS = ' pnbrqk';

// Castling rights: 1 = white king side, 2 = white queen side, 4 = black king side, 8 = black queen side.
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0] = 15 & ~2;
CASTLE_MASK[7] = 15 & ~1;
CASTLE_MASK[4] = 15 & ~3;
CASTLE_MASK[0x70] = 15 & ~8;
CASTLE_MASK[0x77] = 15 & ~4;
CASTLE_MASK[0x74] = 15 & ~12;

// Zobrist keys: two independent 32-bit halves, generated from a fixed seed (stable between runs).
function keyStream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
}
const next1 = keyStream(0x5eed1);
const next2 = keyStream(0x5eed2);
const Z_PIECE1 = new Int32Array(13 * 128).map(() => next1());
const Z_PIECE2 = new Int32Array(13 * 128).map(() => next2());
const Z_CASTLE1 = new Int32Array(16).map(() => next1());
const Z_CASTLE2 = new Int32Array(16).map(() => next2());
const Z_EP1 = new Int32Array(128).map(() => next1());
const Z_EP2 = new Int32Array(128).map(() => next2());
const Z_SIDE1 = next1();
const Z_SIDE2 = next2();

const pieceKey = (piece: number, sq: number) => (piece + 6) * 128 + sq;

export const onBoard = (sq: number): boolean => (sq & 0x88) === 0;
export const moveFrom = (m: number): number => m & 0x7f;
export const moveTo = (m: number): number => (m >> 7) & 0x7f;
export const movePromo = (m: number): number => (m >> 14) & 7;
export const moveFlags = (m: number): number => m >> 17;
const encode = (from: number, to: number, promo: number, flags: number) => from | (to << 7) | (promo << 14) | (flags << 17);

export function squareName(sq: number): string {
  return 'abcdefgh'[sq & 7] + String((sq >> 4) + 1);
}

export function parseSquare(name: string): number {
  const file = name.charCodeAt(0) - 97;
  const rank = name.charCodeAt(1) - 49;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return rank * 16 + file;
}

export function moveToUci(m: number): string {
  const promo = movePromo(m);
  return squareName(moveFrom(m)) + squareName(moveTo(m)) + (promo ? PIECE_CHARS[promo] : '');
}

interface Undo {
  move: number;
  captured: number;
  castling: number;
  ep: number;
  halfmove: number;
  hash1: number;
  hash2: number;
}

export class Position {
  board = new Int8Array(128);
  /** 1 = white to move, -1 = black. */
  side = 1;
  castling = 0;
  ep = -1;
  halfmove = 0;
  fullmove = 1;
  kings = [-1, -1];
  hash1 = 0;
  hash2 = 0;
  private undos: Undo[] = [];
  /** hash1 of every position since the game start (repetition detection). */
  hashHistory: number[] = [];

  constructor(fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
    this.load(fen);
  }

  load(fen: string): void {
    const [placement, turn = 'w', castle = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
    this.board.fill(0);
    this.kings = [-1, -1];
    const rows = placement.split('/');
    if (rows.length !== 8) throw new Error(`[chess] bad FEN: ${fen}`);
    rows.forEach((row, i) => {
      const rank = 7 - i;
      let file = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) {
          file += Number(ch);
          continue;
        }
        const type = PIECE_CHARS.indexOf(ch.toLowerCase());
        if (type <= 0 || file > 7) throw new Error(`[chess] bad FEN: ${fen}`);
        const piece = ch === ch.toLowerCase() ? -type : type;
        const sq = rank * 16 + file;
        this.board[sq] = piece;
        if (type === KING) this.kings[piece > 0 ? 0 : 1] = sq;
        file += 1;
      }
    });
    this.side = turn === 'b' ? -1 : 1;
    this.castling = (castle.includes('K') ? 1 : 0) | (castle.includes('Q') ? 2 : 0) | (castle.includes('k') ? 4 : 0) | (castle.includes('q') ? 8 : 0);
    this.ep = ep === '-' ? -1 : parseSquare(ep);
    this.halfmove = Number(half) || 0;
    this.fullmove = Number(full) || 1;
    this.undos = [];
    this.computeHash();
    this.hashHistory = [this.hash1];
  }

  fen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = this.board[rank * 16 + file];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) row += String(empty);
        empty = 0;
        const ch = PIECE_CHARS[Math.abs(p)];
        row += p > 0 ? ch.toUpperCase() : ch;
      }
      if (empty) row += String(empty);
      rows.push(row);
    }
    const c = this.castling;
    const castle = (c & 1 ? 'K' : '') + (c & 2 ? 'Q' : '') + (c & 4 ? 'k' : '') + (c & 8 ? 'q' : '') || '-';
    return `${rows.join('/')} ${this.side === 1 ? 'w' : 'b'} ${castle} ${this.ep >= 0 ? squareName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
  }

  private computeHash(): void {
    let h1 = 0;
    let h2 = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (!onBoard(sq) || !this.board[sq]) continue;
      const k = pieceKey(this.board[sq], sq);
      h1 ^= Z_PIECE1[k];
      h2 ^= Z_PIECE2[k];
    }
    h1 ^= Z_CASTLE1[this.castling];
    h2 ^= Z_CASTLE2[this.castling];
    if (this.ep >= 0) {
      h1 ^= Z_EP1[this.ep];
      h2 ^= Z_EP2[this.ep];
    }
    if (this.side === -1) {
      h1 ^= Z_SIDE1;
      h2 ^= Z_SIDE2;
    }
    this.hash1 = h1;
    this.hash2 = h2;
  }

  /** Is `sq` attacked by `by` (1 white, -1 black)? */
  isAttacked(sq: number, by: number): boolean {
    const b = this.board;
    // Pawns: a white pawn on s attacks s+15 and s+17.
    if (by === 1) {
      if (onBoard(sq - 15) && b[sq - 15] === PAWN) return true;
      if (onBoard(sq - 17) && b[sq - 17] === PAWN) return true;
    } else {
      if (onBoard(sq + 15) && b[sq + 15] === -PAWN) return true;
      if (onBoard(sq + 17) && b[sq + 17] === -PAWN) return true;
    }
    for (const d of KNIGHT_DIRS) {
      const t = sq + d;
      if (onBoard(t) && b[t] === by * KNIGHT) return true;
    }
    for (const d of KING_DIRS) {
      const t = sq + d;
      if (onBoard(t) && b[t] === by * KING) return true;
    }
    for (const d of BISHOP_DIRS) {
      for (let t = sq + d; onBoard(t); t += d) {
        const p = b[t];
        if (!p) continue;
        if (p === by * BISHOP || p === by * QUEEN) return true;
        break;
      }
    }
    for (const d of ROOK_DIRS) {
      for (let t = sq + d; onBoard(t); t += d) {
        const p = b[t];
        if (!p) continue;
        if (p === by * ROOK || p === by * QUEEN) return true;
        break;
      }
    }
    return false;
  }

  inCheck(side = this.side): boolean {
    const k = this.kings[side === 1 ? 0 : 1];
    return k >= 0 && this.isAttacked(k, -side);
  }

  /** Pseudo-legal moves (king safety is checked after make). `capturesOnly` adds promotions too. */
  generate(out: number[], capturesOnly = false): number[] {
    const b = this.board;
    const us = this.side;
    for (let from = 0; from < 128; from++) {
      if (!onBoard(from)) {
        from += 7;
        continue;
      }
      const p = b[from];
      if (!p || (p > 0 ? 1 : -1) !== us) continue;
      const type = p * us;
      if (type === PAWN) {
        const fwd = us === 1 ? 16 : -16;
        const startRank = us === 1 ? 1 : 6;
        const lastRank = us === 1 ? 7 : 0;
        const one = from + fwd;
        if (onBoard(one) && !b[one]) {
          if (one >> 4 === lastRank) {
            for (const promo of [QUEEN, KNIGHT, ROOK, BISHOP]) out.push(encode(from, one, promo, 0));
          } else if (!capturesOnly) {
            out.push(encode(from, one, 0, 0));
            const two = one + fwd;
            if (from >> 4 === startRank && !b[two]) out.push(encode(from, two, 0, FLAG_DOUBLE));
          }
        }
        for (const side of [fwd - 1, fwd + 1]) {
          const to = from + side;
          if (!onBoard(to)) continue;
          const target = b[to];
          if (target && (target > 0 ? 1 : -1) !== us) {
            if (to >> 4 === lastRank) {
              for (const promo of [QUEEN, KNIGHT, ROOK, BISHOP]) out.push(encode(from, to, promo, FLAG_CAPTURE));
            } else out.push(encode(from, to, 0, FLAG_CAPTURE));
          } else if (to === this.ep) out.push(encode(from, to, 0, FLAG_CAPTURE | FLAG_EP));
        }
        continue;
      }
      const slide = type === BISHOP || type === ROOK || type === QUEEN;
      const dirs = type === KNIGHT ? KNIGHT_DIRS : type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : KING_DIRS;
      for (const d of dirs) {
        for (let to = from + d; onBoard(to); to += d) {
          const target = b[to];
          if (target) {
            if ((target > 0 ? 1 : -1) !== us) out.push(encode(from, to, 0, FLAG_CAPTURE));
            break;
          }
          if (!capturesOnly) out.push(encode(from, to, 0, 0));
          if (!slide) break;
        }
      }
      if (type === KING && !capturesOnly) this.castles(from, out);
    }
    return out;
  }

  private castles(from: number, out: number[]): void {
    const b = this.board;
    const us = this.side;
    const home = us === 1 ? 4 : 0x74;
    if (from !== home) return;
    const ks = us === 1 ? 1 : 4;
    const qs = us === 1 ? 2 : 8;
    const rook = us * ROOK;
    if (this.castling & ks && !b[home + 1] && !b[home + 2] && b[home + 3] === rook) {
      if (!this.isAttacked(home, -us) && !this.isAttacked(home + 1, -us) && !this.isAttacked(home + 2, -us)) {
        out.push(encode(home, home + 2, 0, FLAG_CASTLE));
      }
    }
    if (this.castling & qs && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === rook) {
      if (!this.isAttacked(home, -us) && !this.isAttacked(home - 1, -us) && !this.isAttacked(home - 2, -us)) {
        out.push(encode(home, home - 2, 0, FLAG_CASTLE));
      }
    }
  }

  private put(sq: number, piece: number): void {
    const old = this.board[sq];
    if (old) {
      const k = pieceKey(old, sq);
      this.hash1 ^= Z_PIECE1[k];
      this.hash2 ^= Z_PIECE2[k];
    }
    this.board[sq] = piece;
    if (piece) {
      const k = pieceKey(piece, sq);
      this.hash1 ^= Z_PIECE1[k];
      this.hash2 ^= Z_PIECE2[k];
    }
  }

  /** Plays a pseudo-legal move. Returns false (and takes it back) when it leaves the own king in check. */
  make(m: number): boolean {
    const from = moveFrom(m);
    const to = moveTo(m);
    const flags = moveFlags(m);
    const promo = movePromo(m);
    const b = this.board;
    const us = this.side;
    const piece = b[from];
    const epCapSq = flags & FLAG_EP ? to - us * 16 : -1;
    const captured = flags & FLAG_EP ? b[epCapSq] : b[to];
    this.undos.push({ move: m, captured, castling: this.castling, ep: this.ep, halfmove: this.halfmove, hash1: this.hash1, hash2: this.hash2 });

    this.hash1 ^= Z_CASTLE1[this.castling];
    this.hash2 ^= Z_CASTLE2[this.castling];
    if (this.ep >= 0) {
      this.hash1 ^= Z_EP1[this.ep];
      this.hash2 ^= Z_EP2[this.ep];
    }

    if (epCapSq >= 0) this.put(epCapSq, 0);
    this.put(to, promo ? us * promo : piece);
    this.put(from, 0);
    if (flags & FLAG_CASTLE) {
      if (to > from) {
        this.put(from + 1, b[from + 3]);
        this.put(from + 3, 0);
      } else {
        this.put(from - 1, b[from - 4]);
        this.put(from - 4, 0);
      }
    }
    if (piece * us === KING) this.kings[us === 1 ? 0 : 1] = to;

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flags & FLAG_DOUBLE ? from + us * 16 : -1;
    this.halfmove = piece * us === PAWN || captured ? 0 : this.halfmove + 1;
    if (us === -1) this.fullmove++;
    this.side = -us;
    this.hash1 ^= Z_CASTLE1[this.castling] ^ Z_SIDE1;
    this.hash2 ^= Z_CASTLE2[this.castling] ^ Z_SIDE2;
    if (this.ep >= 0) {
      this.hash1 ^= Z_EP1[this.ep];
      this.hash2 ^= Z_EP2[this.ep];
    }
    this.hashHistory.push(this.hash1);
    if (this.inCheck(us)) {
      this.unmake();
      return false;
    }
    return true;
  }

  unmake(): void {
    const u = this.undos.pop();
    if (!u) return;
    this.hashHistory.pop();
    const m = u.move;
    const from = moveFrom(m);
    const to = moveTo(m);
    const flags = moveFlags(m);
    const us = -this.side;
    const b = this.board;
    const moved = movePromo(m) ? us * PAWN : b[to];
    b[from] = moved;
    if (flags & FLAG_EP) {
      b[to] = 0;
      b[to - us * 16] = u.captured;
    } else b[to] = u.captured;
    if (flags & FLAG_CASTLE) {
      if (to > from) {
        b[from + 3] = b[from + 1];
        b[from + 1] = 0;
      } else {
        b[from - 4] = b[from - 1];
        b[from - 1] = 0;
      }
    }
    if (moved * us === KING) this.kings[us === 1 ? 0 : 1] = from;
    if (us === -1) this.fullmove--;
    this.side = us;
    this.castling = u.castling;
    this.ep = u.ep;
    this.halfmove = u.halfmove;
    this.hash1 = u.hash1;
    this.hash2 = u.hash2;
  }

  /** Null move for null-move pruning (side flips, en passant is cleared). */
  makeNull(): void {
    this.undos.push({ move: 0, captured: 0, castling: this.castling, ep: this.ep, halfmove: this.halfmove, hash1: this.hash1, hash2: this.hash2 });
    if (this.ep >= 0) {
      this.hash1 ^= Z_EP1[this.ep];
      this.hash2 ^= Z_EP2[this.ep];
    }
    this.ep = -1;
    this.side = -this.side;
    this.hash1 ^= Z_SIDE1;
    this.hash2 ^= Z_SIDE2;
    this.halfmove++;
    this.hashHistory.push(this.hash1);
  }

  unmakeNull(): void {
    const u = this.undos.pop();
    if (!u) return;
    this.hashHistory.pop();
    this.side = -this.side;
    this.castling = u.castling;
    this.ep = u.ep;
    this.halfmove = u.halfmove;
    this.hash1 = u.hash1;
    this.hash2 = u.hash2;
  }

  legalMoves(): number[] {
    const out: number[] = [];
    for (const m of this.generate([])) {
      if (this.make(m)) {
        this.unmake();
        out.push(m);
      }
    }
    return out;
  }

  /** The current position occurred before within the reversible stretch (halfmove clock). */
  isRepetition(): boolean {
    const h = this.hashHistory;
    const last = h.length - 1;
    const stop = Math.max(0, last - this.halfmove);
    for (let i = last - 2; i >= stop; i -= 2) if (h[i] === this.hash1) return true;
    return false;
  }

  /** Finds the move with this UCI string among legal moves; -1 when illegal. */
  parseUci(uci: string): number {
    for (const m of this.legalMoves()) if (moveToUci(m) === uci) return m;
    return -1;
  }

  ply(): number {
    return this.undos.length;
  }
}
