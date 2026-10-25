// Computer opponent without dependencies: negamax with alpha-beta (PVS), iterative deepening with
// a time limit, transposition table, piece-square tables, MVV-LVA ordering, killers and quiescence.
// Levels 1–6: 1 plays deliberately sloppy moves for preschoolers, 6 is roughly a weak club player.
// Deterministic for a given seed when no time limit applies (tests pass `maxDepth`).

import {
  BISHOP,
  FLAG_CAPTURE,
  KING,
  KNIGHT,
  PAWN,
  Position,
  QUEEN,
  ROOK,
  moveFlags,
  moveFrom,
  movePromo,
  moveTo,
  moveToUci,
} from './position.ts';

export type AiLevel = 1 | 2 | 3 | 4 | 5 | 6;
export const AI_LEVELS: readonly AiLevel[] = [1, 2, 3, 4, 5, 6];

export const AI_LEVEL_LABELS: Record<AiLevel, { name: string; hint: string }> = {
  1: { name: 'Kuřátko', hint: 'Dělá schválně chyby. Pro nejmenší.' },
  2: { name: 'Zajíček', hint: 'Vidí jen o tah dopředu.' },
  3: { name: 'Liška', hint: 'Sebere, co necháš viset.' },
  4: { name: 'Jezevec', hint: 'Počítá pár tahů dopředu.' },
  5: { name: 'Vlk', hint: 'Hraje opatrně a přesně.' },
  6: { name: 'Sova', hint: 'Nejsilnější. Slabý klubový hráč.' },
};

interface LevelProfile {
  depth: number;
  timeMs: number;
  /** Root moves within this many centipawns of the best one are candidates (0 = always the best). */
  window: number;
  /** Chance of a plain random legal move (a deliberate mistake). */
  randomRate: number;
}

const PROFILES: Record<AiLevel, LevelProfile> = {
  1: { depth: 1, timeMs: 300, window: 250, randomRate: 0.25 },
  2: { depth: 1, timeMs: 300, window: 120, randomRate: 0.1 },
  3: { depth: 2, timeMs: 400, window: 60, randomRate: 0.03 },
  4: { depth: 3, timeMs: 700, window: 25, randomRate: 0 },
  5: { depth: 5, timeMs: 1200, window: 0, randomRate: 0 },
  6: { depth: 64, timeMs: 2500, window: 0, randomRate: 0 },
};

export const MATE = 100_000;
const INF = 1_000_000;
const MAX_PLY = 96;

export const PIECE_VALUE = [0, 100, 320, 330, 500, 900, 0];

// Piece-square tables from white's point of view, index = rank * 8 + file (a1 = 0). Own values:
// pawns go forward and to the centre, minor pieces to the centre, the king hides in the middlegame.
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 8, 8, -12, -12, 8, 8, 5,
  4, 0, -4, 4, 4, -4, 0, 4,
  0, 0, 6, 22, 22, 6, 0, 0,
  6, 6, 12, 26, 26, 12, 6, 6,
  12, 14, 22, 30, 30, 22, 14, 12,
  45, 45, 45, 50, 50, 45, 45, 45,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_KNIGHT = [
  -45, -30, -22, -20, -20, -22, -30, -45,
  -30, -15, 0, 4, 4, 0, -15, -30,
  -22, 4, 12, 14, 14, 12, 4, -22,
  -20, 2, 15, 20, 20, 15, 2, -20,
  -20, 4, 16, 22, 22, 16, 4, -20,
  -22, 2, 12, 16, 16, 12, 2, -22,
  -30, -15, 0, 2, 2, 0, -15, -30,
  -45, -30, -22, -20, -20, -22, -30, -45,
];
const PST_BISHOP = [
  -18, -8, -12, -8, -8, -12, -8, -18,
  -8, 8, 2, 4, 4, 2, 8, -8,
  -8, 8, 8, 8, 8, 8, 8, -8,
  -8, 2, 10, 10, 10, 10, 2, -8,
  -8, 4, 6, 10, 10, 6, 4, -8,
  -8, 0, 6, 8, 8, 6, 0, -8,
  -8, 0, 0, 0, 0, 0, 0, -8,
  -18, -8, -8, -8, -8, -8, -8, -18,
];
const PST_ROOK = [
  0, 0, 4, 8, 8, 6, 0, 0,
  -6, 0, 0, 0, 0, 0, 0, -6,
  -6, 0, 0, 0, 0, 0, 0, -6,
  -6, 0, 0, 0, 0, 0, 0, -6,
  -6, 0, 0, 0, 0, 0, 0, -6,
  -6, 0, 0, 0, 0, 0, 0, -6,
  8, 12, 12, 12, 12, 12, 12, 8,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_QUEEN = [
  -18, -10, -8, -4, -4, -8, -10, -18,
  -10, 0, 4, 0, 0, 0, 0, -10,
  -8, 4, 4, 4, 4, 4, 0, -8,
  -4, 0, 4, 4, 4, 4, 0, -4,
  -4, 0, 4, 4, 4, 4, 0, -4,
  -8, 0, 4, 4, 4, 4, 0, -8,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -18, -10, -8, -4, -4, -8, -10, -18,
];
const PST_KING_MID = [
  18, 28, 8, -6, 0, 6, 30, 20,
  14, 14, -6, -12, -12, -6, 14, 14,
  -10, -20, -20, -24, -24, -20, -20, -10,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
];
const PST_KING_END = [
  -45, -30, -22, -18, -18, -22, -30, -45,
  -30, -12, 0, 4, 4, 0, -12, -30,
  -22, 0, 18, 24, 24, 18, 0, -22,
  -18, 4, 24, 32, 32, 24, 4, -18,
  -18, 4, 24, 32, 32, 24, 4, -18,
  -22, 0, 18, 24, 24, 18, 0, -22,
  -30, -12, 0, 4, 4, 0, -12, -30,
  -45, -30, -22, -18, -18, -22, -30, -45,
];
const PST = [null, PST_PAWN, PST_KNIGHT, PST_BISHOP, PST_ROOK, PST_QUEEN, PST_KING_MID];

const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];

/** Static evaluation in centipawns from the side to move's point of view. */
export function evaluate(pos: Position): number {
  const b = pos.board;
  let mg = 0;
  let phase = 0;
  let wKingEnd = 0;
  let wKingMid = 0;
  let bKingMid = 0;
  let bKingEnd = 0;
  let wMat = 0;
  let bMat = 0;
  let wBishops = 0;
  let bBishops = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const p = b[sq];
    if (!p) continue;
    const type = p > 0 ? p : -p;
    const idx = (sq >> 4) * 8 + (sq & 7);
    // Black reads the table mirrored by rank.
    const pidx = p > 0 ? idx : (7 - (sq >> 4)) * 8 + (sq & 7);
    phase += PHASE_WEIGHT[type];
    if (type === KING) {
      if (p > 0) {
        wKingMid = PST_KING_MID[pidx];
        mg += wKingMid;
        wKingEnd = PST_KING_END[pidx];
      } else {
        bKingMid = PST_KING_MID[pidx];
        mg -= bKingMid;
        bKingEnd = PST_KING_END[pidx];
      }
      continue;
    }
    const v = PIECE_VALUE[type] + (PST[type] as number[])[pidx];
    if (p > 0) {
      mg += v;
      if (type !== PAWN) wMat += PIECE_VALUE[type];
      if (type === BISHOP) wBishops++;
    } else {
      mg -= v;
      if (type !== PAWN) bMat += PIECE_VALUE[type];
      if (type === BISHOP) bBishops++;
    }
  }
  if (wBishops >= 2) mg += 30;
  if (bBishops >= 2) mg -= 30;
  // King tables blend from middlegame (phase 24) to endgame (phase 0).
  const ph = Math.min(phase, 24);
  let score = mg + Math.round(((24 - ph) * (wKingEnd - bKingEnd - (wKingMid - bKingMid))) / 24);
  // Mop-up: with a clear material edge in the endgame, drive the bare king to the edge.
  if (ph <= 8 && Math.abs(wMat - bMat) >= 400) {
    const strong = wMat > bMat ? 0 : 1;
    const weakKing = pos.kings[1 - strong];
    const strongKing = pos.kings[strong];
    if (weakKing >= 0 && strongKing >= 0) {
      const wf = weakKing & 7;
      const wr = weakKing >> 4;
      const centre = Math.max(3 - wf, wf - 4) + Math.max(3 - wr, wr - 4);
      const dist = Math.abs(wf - (strongKing & 7)) + Math.abs(wr - (strongKing >> 4));
      const bonus = centre * 12 + (14 - dist) * 5;
      score += strong === 0 ? bonus : -bonus;
    }
  }
  return score * pos.side;
}

// ---------- seeded randomness ----------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- search ----------

const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

class Searcher {
  nodes = 0;
  stopped = false;
  private deadline = Infinity;
  private maxNodes = Infinity;
  private ttKey = new Int32Array(TT_SIZE);
  private ttMove = new Int32Array(TT_SIZE);
  private ttScore = new Int32Array(TT_SIZE);
  private ttDepth = new Int8Array(TT_SIZE);
  private ttFlag = new Int8Array(TT_SIZE);
  private killers = new Int32Array(MAX_PLY * 2);
  private historyTable = new Int32Array(128 * 128);

  readonly pos: Position;

  constructor(pos: Position, limits: { deadline?: number; maxNodes?: number }) {
    this.pos = pos;
    this.deadline = limits.deadline ?? Infinity;
    this.maxNodes = limits.maxNodes ?? Infinity;
  }

  private checkLimits(): void {
    if (this.nodes >= this.maxNodes || (this.deadline !== Infinity && (this.nodes & 1023) === 0 && now() >= this.deadline)) this.stopped = true;
  }

  private scoreMoves(moves: number[], ttMove: number, ply: number): Int32Array {
    const b = this.pos.board;
    const scores = new Int32Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m === ttMove) {
        scores[i] = 10_000_000;
        continue;
      }
      const flags = moveFlags(m);
      const promo = movePromo(m);
      if (flags & FLAG_CAPTURE || promo) {
        const victim = flags & FLAG_CAPTURE ? Math.abs(b[moveTo(m)]) || PAWN : 0;
        const attacker = Math.abs(b[moveFrom(m)]);
        // MVV-LVA: most valuable victim first, cheapest attacker first.
        scores[i] = 1_000_000 + PIECE_VALUE[victim] * 10 - PIECE_VALUE[attacker] / 10 + (promo ? PIECE_VALUE[promo] * 10 : 0);
      } else if (m === this.killers[ply * 2]) scores[i] = 900_000;
      else if (m === this.killers[ply * 2 + 1]) scores[i] = 800_000;
      else scores[i] = Math.min(700_000, this.historyTable[moveFrom(m) * 128 + moveTo(m)]);
    }
    return scores;
  }

  private static pick(moves: number[], scores: Int32Array, start: number): number {
    let best = start;
    for (let i = start + 1; i < moves.length; i++) if (scores[i] > scores[best]) best = i;
    if (best !== start) {
      const m = moves[start];
      moves[start] = moves[best];
      moves[best] = m;
      const s = scores[start];
      scores[start] = scores[best];
      scores[best] = s;
    }
    return moves[start];
  }

  quiesce(alpha: number, beta: number, ply: number): number {
    this.nodes++;
    this.checkLimits();
    if (this.stopped) return 0;
    const pos = this.pos;
    const inCheck = pos.inCheck();
    if (ply >= MAX_PLY - 1) return evaluate(pos);
    if (!inCheck) {
      const stand = evaluate(pos);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
    }
    const moves = pos.generate([], !inCheck);
    const scores = this.scoreMoves(moves, 0, ply);
    let legal = 0;
    let best = inCheck ? -INF : alpha;
    for (let i = 0; i < moves.length; i++) {
      const m = Searcher.pick(moves, scores, i);
      if (!pos.make(m)) continue;
      legal++;
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stopped) return 0;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    if (inCheck && legal === 0) return -MATE + ply;
    return inCheck ? best : alpha;
  }

  search(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    const pos = this.pos;
    if (ply > 0) {
      if (pos.halfmove >= 100 || pos.isRepetition()) return 0;
      // Mate distance pruning.
      alpha = Math.max(alpha, -MATE + ply);
      beta = Math.min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
    }
    const inCheck = pos.inCheck();
    if (inCheck && ply < MAX_PLY / 2) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    this.nodes++;
    this.checkLimits();
    if (this.stopped) return 0;
    if (ply >= MAX_PLY - 1) return evaluate(pos);

    const pvNode = beta - alpha > 1;
    const slot = pos.hash1 & TT_MASK;
    let ttMove = 0;
    if (this.ttKey[slot] === pos.hash2 && this.ttFlag[slot]) {
      ttMove = this.ttMove[slot];
      if (ply > 0 && this.ttDepth[slot] >= depth && !pvNode) {
        let s = this.ttScore[slot];
        if (s > MATE - 1000) s -= ply;
        else if (s < -MATE + 1000) s += ply;
        const f = this.ttFlag[slot];
        if (f === TT_EXACT || (f === TT_LOWER && s >= beta) || (f === TT_UPPER && s <= alpha)) return s;
      }
    }

    // Null move: skipped in check, in pawn endings (zugzwang) and near mate scores.
    if (allowNull && !pvNode && !inCheck && depth >= 3 && hasPieces(pos) && beta < MATE - 1000) {
      pos.makeNull();
      const s = -this.search(depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (this.stopped) return 0;
      if (s >= beta) return beta;
    }

    const moves = pos.generate([]);
    const scores = this.scoreMoves(moves, ttMove, ply);
    const alpha0 = alpha;
    let best = -INF;
    let bestMove = 0;
    let legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = Searcher.pick(moves, scores, i);
      if (!pos.make(m)) continue;
      legal++;
      const quiet = !(moveFlags(m) & FLAG_CAPTURE) && !movePromo(m);
      let score: number;
      if (legal === 1) score = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        // Late move reduction for quiet moves that do not give check.
        const reduce = depth >= 3 && legal > 4 && quiet && !inCheck && !pos.inCheck() ? 1 : 0;
        score = -this.search(depth - 1 - reduce, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && (reduce || score < beta)) score = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (this.stopped) return 0;
      if (score > best) {
        best = score;
        bestMove = m;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (quiet) {
          if (this.killers[ply * 2] !== m) {
            this.killers[ply * 2 + 1] = this.killers[ply * 2];
            this.killers[ply * 2] = m;
          }
          this.historyTable[moveFrom(m) * 128 + moveTo(m)] += depth * depth;
        }
        break;
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;

    let stored = best;
    if (stored > MATE - 1000) stored += ply;
    else if (stored < -MATE + 1000) stored -= ply;
    this.ttKey[slot] = pos.hash2;
    this.ttMove[slot] = bestMove;
    this.ttScore[slot] = stored;
    this.ttDepth[slot] = depth;
    this.ttFlag[slot] = best >= beta ? TT_LOWER : best <= alpha0 ? TT_UPPER : TT_EXACT;
    return best;
  }

  /** Principal variation from the transposition table. */
  pv(max: number): number[] {
    const pos = this.pos;
    const line: number[] = [];
    const seen = new Set<number>();
    while (line.length < max) {
      const slot = pos.hash1 & TT_MASK;
      if (this.ttKey[slot] !== pos.hash2 || !this.ttFlag[slot] || seen.has(pos.hash1)) break;
      seen.add(pos.hash1);
      const m = this.ttMove[slot];
      if (!m || !pos.legalMoves().includes(m)) break;
      pos.make(m);
      line.push(m);
    }
    for (let i = 0; i < line.length; i++) pos.unmake();
    return line;
  }

  /** Iterative deepening at the root; returns the best move of the deepest finished (or improved) iteration. */
  rootSearch(maxDepth: number): { move: number; score: number; depth: number } {
    const pos = this.pos;
    const rootMoves = pos.legalMoves();
    let bestMove = rootMoves[0] ?? 0;
    let bestScore = 0;
    let doneDepth = 0;
    for (let depth = 1; depth <= maxDepth && rootMoves.length; depth++) {
      let alpha = -INF;
      const beta = INF;
      let iterBest = 0;
      let iterScore = -INF;
      // Previous best first.
      rootMoves.sort((a, b) => (a === bestMove ? -1 : b === bestMove ? 1 : 0));
      for (const m of rootMoves) {
        pos.make(m);
        let score: number;
        if (!iterBest) score = -this.search(depth - 1, -beta, -alpha, 1, true);
        else {
          score = -this.search(depth - 1, -alpha - 1, -alpha, 1, true);
          if (!this.stopped && score > alpha) score = -this.search(depth - 1, -beta, -alpha, 1, true);
        }
        pos.unmake();
        if (this.stopped) break;
        if (score > iterScore) {
          iterScore = score;
          iterBest = m;
        }
        if (score > alpha) alpha = score;
      }
      if (iterBest && (!this.stopped || iterScore > bestScore || doneDepth === 0)) {
        bestMove = iterBest;
        bestScore = iterScore;
        if (!this.stopped) doneDepth = depth;
        const slot = pos.hash1 & TT_MASK;
        this.ttKey[slot] = pos.hash2;
        this.ttMove[slot] = bestMove;
        this.ttScore[slot] = bestScore;
        this.ttDepth[slot] = depth;
        this.ttFlag[slot] = TT_EXACT;
      }
      if (this.stopped) break;
      // A found mate does not get any better with more depth.
      if (Math.abs(bestScore) > MATE - 1000 && MATE - Math.abs(bestScore) <= depth) break;
    }
    return { move: bestMove, score: bestScore, depth: doneDepth };
  }

  /** Every root move scored at a fixed depth with a full window (for the weaker levels). */
  scoreRoot(depth: number): { move: number; score: number }[] {
    const pos = this.pos;
    const out: { move: number; score: number }[] = [];
    for (const m of pos.legalMoves()) {
      pos.make(m);
      const score = -this.search(depth - 1, -INF, INF, 1, false);
      pos.unmake();
      if (this.stopped) break;
      out.push({ move: m, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }
}

function hasPieces(pos: Position): boolean {
  const b = pos.board;
  const s = pos.side;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const t = b[sq] * s;
    if (t === KNIGHT || t === BISHOP || t === ROOK || t === QUEEN) return true;
  }
  return false;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ---------- public API ----------

export interface SearchInput {
  /** Position to search. With `moves`, the start position they are played from. */
  fen?: string;
  /** Moves (UCI) from `fen`, so repetitions of the game count. */
  moves?: readonly string[];
}

export interface SearchOptions {
  level?: AiLevel;
  seed?: number;
  /** Overrides the level's time budget; Infinity = depth/node limit only (deterministic). */
  timeMs?: number;
  /** Overrides the level's depth. */
  maxDepth?: number;
  maxNodes?: number;
}

export interface SearchResult {
  /** Best move in UCI (e2e4, e7e8q); null when the side to move has no legal move. */
  uci: string | null;
  /** Centipawns from the side to move's point of view (mate ≈ ±100000). */
  score: number;
  /** Moves to mate for the side to move (positive = it mates, negative = it is mated); null otherwise. */
  mateIn: number | null;
  depth: number;
  nodes: number;
  pv: string[];
}

export function positionFrom(input: SearchInput): Position {
  const pos = new Position(input.fen);
  for (const uci of input.moves ?? []) {
    const m = pos.parseUci(uci);
    if (m < 0) throw new Error(`[chess] illegal move in history: ${uci}`);
    pos.make(m);
  }
  return pos;
}

function mateIn(score: number): number | null {
  if (score > MATE - 1000) return Math.ceil((MATE - score) / 2);
  if (score < -MATE + 1000) return -Math.ceil((MATE + score) / 2);
  return null;
}

/** Full-strength analysis (hints, blunder check): the best move at the given depth or time. */
export function analyze(input: SearchInput, options: { maxDepth?: number; timeMs?: number; maxNodes?: number } = {}): SearchResult {
  const pos = positionFrom(input);
  const timeMs = options.timeMs ?? Infinity;
  const s = new Searcher(pos, { deadline: timeMs === Infinity ? Infinity : now() + timeMs, maxNodes: options.maxNodes });
  const { move, score, depth } = s.rootSearch(options.maxDepth ?? 64);
  const pv = move ? s.pv(12).map(moveToUci) : [];
  if (move && pv[0] !== moveToUci(move)) pv.splice(0, pv.length, moveToUci(move));
  return { uci: move ? moveToUci(move) : null, score, mateIn: mateIn(score), depth, nodes: s.nodes, pv };
}

/** The computer's move at a level. Weak levels pick randomly among "reasonable" moves. */
export function chooseMove(input: SearchInput, options: SearchOptions = {}): SearchResult {
  const level = options.level ?? 6;
  const profile = PROFILES[level];
  const rand = mulberry32(options.seed ?? 1);
  const pos = positionFrom(input);
  const legal = pos.legalMoves();
  if (!legal.length) return { uci: null, score: pos.inCheck() ? -MATE : 0, mateIn: pos.inCheck() ? 0 : null, depth: 0, nodes: 0, pv: [] };
  const timeMs = options.timeMs ?? profile.timeMs;
  const deadline = timeMs === Infinity ? Infinity : now() + timeMs;
  const depth = options.maxDepth ?? profile.depth;

  if (profile.window === 0 && profile.randomRate === 0) {
    const s = new Searcher(pos, { deadline, maxNodes: options.maxNodes });
    const r = s.rootSearch(depth);
    return { uci: moveToUci(r.move), score: r.score, mateIn: mateIn(r.score), depth: r.depth, nodes: s.nodes, pv: [moveToUci(r.move)] };
  }

  if (rand() < profile.randomRate) {
    const m = legal[Math.floor(rand() * legal.length)];
    return { uci: moveToUci(m), score: 0, mateIn: null, depth: 0, nodes: 0, pv: [moveToUci(m)] };
  }
  const s = new Searcher(pos, { deadline, maxNodes: options.maxNodes });
  const scored = s.scoreRoot(depth);
  if (!scored.length) {
    const m = legal[Math.floor(rand() * legal.length)];
    return { uci: moveToUci(m), score: 0, mateIn: null, depth: 0, nodes: s.nodes, pv: [moveToUci(m)] };
  }
  const top = scored[0].score;
  const candidates = scored.filter((x) => x.score >= top - profile.window);
  const pick = candidates[Math.floor(rand() * candidates.length)];
  return { uci: moveToUci(pick.move), score: pick.score, mateIn: mateIn(pick.score), depth, nodes: s.nodes, pv: [moveToUci(pick.move)] };
}

/** Static material balance in pawns from white's view (for the hint texts). */
export function materialBalance(fen: string): number {
  const pos = new Position(fen);
  let sum = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const p = pos.board[sq];
    if (p && Math.abs(p) !== KING) sum += Math.sign(p) * PIECE_VALUE[Math.abs(p)];
  }
  return sum / 100;
}


/** Every legal move scored with a full window at a fixed depth (puzzle checks, deterministic). */
export function scoreMoves(input: SearchInput, depth: number): { uci: string; score: number }[] {
  const pos = positionFrom(input);
  const s = new Searcher(pos, {});
  return s.scoreRoot(depth).map((x) => ({ uci: moveToUci(x.move), score: x.score }));
}
