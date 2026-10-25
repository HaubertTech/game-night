// Hints for kids and beginners: which own pieces hang, a plain-Czech explanation of a move
// ("bere jezdce, dává šach") and how many hints a player of a given level gets.

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import type { Level } from '../../../types.ts';

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Czech names by grammatical case. */
export const PIECE_NAME: Record<PieceSymbol, { nom: string; acc: string; ins: string }> = {
  p: { nom: 'pěšec', acc: 'pěšce', ins: 'pěšcem' },
  n: { nom: 'jezdec', acc: 'jezdce', ins: 'jezdcem' },
  b: { nom: 'střelec', acc: 'střelce', ins: 'střelcem' },
  r: { nom: 'věž', acc: 'věž', ins: 'věží' },
  q: { nom: 'dáma', acc: 'dámu', ins: 'dámou' },
  k: { nom: 'král', acc: 'krále', ins: 'králem' },
};

/** Feminine pieces need „napadená / nekrytá“. */
const FEMININE: ReadonlySet<PieceSymbol> = new Set(['r', 'q']);

export interface HintProfile {
  /** Dots on the squares a selected piece may go to. */
  showMoves: boolean;
  /** „Tvoje figurka je napadená / nekrytá“ after the opponent's move. */
  threatWarnings: boolean;
  /** After a move that loses ≥ 2 pawns of material: gentle warning with a takeback. */
  blunderCheck: boolean;
  /** How many times „Poraď“ may be used in one game; null = without limit. */
  adviceLimit: number | null;
}

export const HINT_PROFILES: Record<Level, HintProfile> = {
  kocarek: { showMoves: true, threatWarnings: true, blunderCheck: true, adviceLimit: null },
  piskoviste: { showMoves: true, threatWarnings: true, blunderCheck: true, adviceLimit: null },
  prvnacek: { showMoves: true, threatWarnings: true, blunderCheck: true, adviceLimit: null },
  lavice: { showMoves: true, threatWarnings: true, blunderCheck: true, adviceLimit: 5 },
  hospoda: { showMoves: true, threatWarnings: false, blunderCheck: false, adviceLimit: 3 },
};

export const NO_HINTS: HintProfile = { showMoves: false, threatWarnings: false, blunderCheck: false, adviceLimit: 0 };

export function hintProfile(level: Level | undefined, enabled = true): HintProfile {
  if (!enabled) return NO_HINTS;
  return HINT_PROFILES[level ?? 'hospoda'];
}

/** Loss (in pawns) from which a move counts as a blunder worth a warning. */
export const BLUNDER_PAWNS = 2;

export interface Threat {
  square: Square;
  type: PieceSymbol;
  /** hanging = attacked and not defended; weaker = attacked by a cheaper piece. */
  kind: 'hanging' | 'weaker';
}

function opposite(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

/** Own pieces of `color` that the opponent can win right now (king excluded). */
export function threatenedPieces(fen: string, color: Color): Threat[] {
  const chess = new Chess(fen, { skipValidation: true });
  const out: Threat[] = [];
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color || sq.type === 'k') continue;
      const attackers = chess.attackers(sq.square, opposite(color));
      if (!attackers.length) continue;
      const defenders = chess.attackers(sq.square, color);
      const cheapest = Math.min(...attackers.map((a) => PIECE_VALUE[chess.get(a)?.type ?? 'q'] || 100));
      if (!defenders.length) out.push({ square: sq.square, type: sq.type, kind: 'hanging' });
      else if (cheapest < PIECE_VALUE[sq.type]) out.push({ square: sq.square, type: sq.type, kind: 'weaker' });
    }
  }
  return out.sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type]);
}

export function threatText(t: Threat): string {
  const name = PIECE_NAME[t.type].nom;
  const fem = FEMININE.has(t.type);
  const tvuj = fem ? 'Tvoje' : 'Tvůj';
  if (t.kind === 'hanging') return `Pozor! ${tvuj} ${name} na ${t.square} je ${fem ? 'napadená' : 'napadený'} a nikdo ${fem ? 'ji' : 'ho'} nekryje.`;
  return `Pozor! ${tvuj} ${name} na ${t.square} je ${fem ? 'napadená' : 'napadený'} slabší figurkou.`;
}

const CENTRE = new Set(['d4', 'e4', 'd5', 'e5']);

export interface MoveExplanation {
  san: string;
  from: Square;
  to: Square;
  /** One or two short sentences, e.g. „Táhni jezdcem z g1 na f3. Vyvine figurku do hry.“ */
  text: string;
  reasons: string[];
}

/** Explains a (legal) move in simple Czech for the „Poraď“ button. */
export function explainMove(fen: string, uci: string): MoveExplanation | null {
  const chess = new Chess(fen, { skipValidation: true });
  const us = chess.turn();
  let move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length > 4 ? { promotion: uci[4] } : {}) });
  } catch {
    return null;
  }
  const before = new Chess(fen, { skipValidation: true });
  const reasons: string[] = [];
  if (chess.isCheckmate()) reasons.push('Dá mat!');
  if (move.isKingsideCastle() || move.isQueensideCastle()) reasons.push('Rošáda schová krále a zapojí věž.');
  if (move.isPromotion()) reasons.push(`Pěšec dojde až na konec a promění se v ${PIECE_NAME[move.promotion as PieceSymbol].acc}.`);
  if (move.captured) {
    const defended = before.attackers(move.to, opposite(us)).length > 0;
    reasons.push(move.isEnPassant() ? 'Sebere pěšce mimochodem (en passant).' : `Sebere ${PIECE_NAME[move.captured].acc}${defended ? '' : ' zadarmo'}.`);
  }
  if (!chess.isCheckmate() && chess.inCheck()) reasons.push('Dá šach.');

  // Escape: the moved piece stood under threat and is safe now.
  const threatsBefore = threatenedPieces(fen, us);
  const threatsAfter = threatenedPieces(swapTurn(chess.fen()), us);
  if (threatsBefore.some((t) => t.square === move.from) && !threatsAfter.some((t) => t.square === move.to)) reasons.push('Uteče z ohrožení.');
  // Defence: another piece that hung is safe after the move.
  const saved = threatsBefore.find((t) => t.square !== move.from && !threatsAfter.some((a) => a.square === t.square) && chess.get(t.square)?.color === us);
  if (saved) reasons.push(`Ochrání ${PIECE_NAME[saved.type].acc} na ${saved.square}.`);

  // Fork: the moved piece now attacks two valuable enemy pieces.
  const attacked = attackedBy(chess, move.to, us);
  if (attacked.filter((t) => t === 'k' || PIECE_VALUE[t] >= 3).length >= 2 && move.piece !== 'k') reasons.push('Napadne dvě figury najednou — vidlička!');

  if (!reasons.length) {
    if ((move.piece === 'n' || move.piece === 'b') && (move.from[1] === '1' || move.from[1] === '8')) reasons.push('Vyvine figurku do hry.');
    else if (move.piece === 'p' && CENTRE.has(move.to)) reasons.push('Obsadí střed šachovnice.');
    else reasons.push('Zlepší postavení figurky.');
  }
  const verb = `Táhni ${PIECE_NAME[move.piece].ins} z ${move.from} na ${move.to}.`;
  return { san: move.san, from: move.from, to: move.to, text: `${verb} ${reasons.join(' ')}`, reasons };
}

/** Enemy piece types attacked from `square` by the piece of `color` standing there. */
function attackedBy(chess: Chess, square: Square, color: Color): PieceSymbol[] {
  const out: PieceSymbol[] = [];
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color === color) continue;
      if (chess.attackers(sq.square, color).includes(square)) out.push(sq.type);
    }
  }
  return out;
}

/** Same position with the other side to move (threat checks look at the board, not the turn). */
export function swapTurn(fen: string): string {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  return parts.join(' ');
}

/** Sentence for a blunder: what the opponent's best reply would win. */
export function blunderText(fenAfter: string, replyUci: string | null): string {
  if (!replyUci) return 'Tenhle tah asi není nejlepší. Chceš ho vrátit?';
  const chess = new Chess(fenAfter, { skipValidation: true });
  try {
    const reply = chess.move({ from: replyUci.slice(0, 2), to: replyUci.slice(2, 4), ...(replyUci.length > 4 ? { promotion: replyUci[4] } : {}) });
    if (chess.isCheckmate()) return `Pozor! Soupeř by ti teď mohl dát mat (${reply.san}). Chceš tah vrátit?`;
    if (reply.captured) return `Pozor! Soupeř by ti mohl sebrat ${PIECE_NAME[reply.captured].acc} (${reply.san}). Chceš tah vrátit?`;
    return `Pozor! Po tahu ${reply.san} bys nejspíš přišel o figurku. Chceš tah vrátit?`;
  } catch {
    return 'Tenhle tah asi není nejlepší. Chceš ho vrátit?';
  }
}
