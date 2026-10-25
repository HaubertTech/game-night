// Card decks for the digital card games: the German-suited (mariášové) 32-card deck for prší and
// the French deck (2 × 52 + 4 jokers) for žolíky. Cards are plain string ids so that every game
// state stays JSON; the helpers below parse them back. Shuffling is seeded (engine/rng.ts).

import { mulberry32, shuffle } from '../../engine/rng.ts';

// ---------------------------------------------------------------------------------------------
// Mariášové karty (prší)

export const MARIAS_SUITS = ['srdce', 'listy', 'zaludy', 'kule'] as const;
export type MariasSuit = (typeof MARIAS_SUITS)[number];

export const MARIAS_RANKS = ['7', '8', '9', '10', 'spodek', 'svrsek', 'kral', 'eso'] as const;
export type MariasRank = (typeof MARIAS_RANKS)[number];

/** `srdce-7`, `kule-svrsek` … */
export type MariasCardId = `${MariasSuit}-${MariasRank}`;

export interface MariasCard {
  id: MariasCardId;
  suit: MariasSuit;
  rank: MariasRank;
}

export const MARIAS_SUIT_LABELS: Record<MariasSuit, string> = {
  srdce: 'srdce',
  listy: 'listy',
  zaludy: 'žaludy',
  kule: 'kule',
};

/** Adjective form for card names („srdcová sedma“). */
const MARIAS_SUIT_ADJ: Record<MariasSuit, { f: string; m: string }> = {
  srdce: { f: 'srdcová', m: 'srdcový' },
  listy: { f: 'zelená', m: 'zelený' },
  zaludy: { f: 'žaludová', m: 'žaludový' },
  kule: { f: 'kulová', m: 'kulový' },
};

export const MARIAS_RANK_LABELS: Record<MariasRank, string> = {
  '7': 'sedma',
  '8': 'osma',
  '9': 'devítka',
  '10': 'desítka',
  spodek: 'spodek',
  svrsek: 'svršek',
  kral: 'král',
  eso: 'eso',
};

/** Short corner index printed on the card. */
export const MARIAS_RANK_SHORT: Record<MariasRank, string> = {
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  spodek: 'Sp',
  svrsek: 'Sv',
  kral: 'K',
  eso: 'E',
};

const MASCULINE: ReadonlySet<MariasRank> = new Set(['spodek', 'svrsek', 'kral']);

export function mariasCard(id: string): MariasCard {
  const dash = id.indexOf('-');
  const suit = id.slice(0, dash) as MariasSuit;
  const rank = id.slice(dash + 1) as MariasRank;
  if (!MARIAS_SUITS.includes(suit) || !MARIAS_RANKS.includes(rank)) throw new Error(`[karty-hra] unknown card ${id}`);
  return { id: id as MariasCardId, suit, rank };
}

export function isMariasCardId(id: unknown): id is MariasCardId {
  if (typeof id !== 'string') return false;
  const dash = id.indexOf('-');
  return (
    dash > 0 &&
    (MARIAS_SUITS as readonly string[]).includes(id.slice(0, dash)) &&
    (MARIAS_RANKS as readonly string[]).includes(id.slice(dash + 1))
  );
}

/** Czech name of a card, e.g. „srdcová sedma“, „zelený svršek“, „kulové eso“. */
export function mariasCardName(id: string): string {
  const c = mariasCard(id);
  if (c.rank === 'eso') {
    const neuter = { srdce: 'srdcové', listy: 'zelené', zaludy: 'žaludové', kule: 'kulové' }[c.suit];
    return `${neuter} eso`;
  }
  const adj = MARIAS_SUIT_ADJ[c.suit][MASCULINE.has(c.rank) ? 'm' : 'f'];
  return `${adj} ${MARIAS_RANK_LABELS[c.rank]}`;
}

export function mariasDeck(): MariasCardId[] {
  const out: MariasCardId[] = [];
  for (const suit of MARIAS_SUITS) for (const rank of MARIAS_RANKS) out.push(`${suit}-${rank}`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Francouzské karty (žolíky)

export const FRENCH_SUITS = ['srdce', 'kary', 'krize', 'piky'] as const;
export type FrenchSuit = (typeof FRENCH_SUITS)[number];

export const FRENCH_SUIT_LABELS: Record<FrenchSuit, string> = {
  srdce: 'srdce',
  kary: 'káry',
  krize: 'kříže',
  piky: 'piky',
};

export const FRENCH_SUIT_SYMBOL: Record<FrenchSuit, string> = { srdce: '♥', kary: '♦', krize: '♣', piky: '♠' };

export const FRENCH_RED: ReadonlySet<FrenchSuit> = new Set(['srdce', 'kary']);

/** 1 = eso, 11 = kluk (J), 12 = dáma (Q), 13 = král (K). */
export type FrenchRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export const FRENCH_RANK_SHORT: Record<FrenchRank, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

const FRENCH_RANK_NAMES: Record<FrenchRank, string> = {
  1: 'eso', 2: 'dvojka', 3: 'trojka', 4: 'čtyřka', 5: 'pětka', 6: 'šestka', 7: 'sedmička', 8: 'osmička',
  9: 'devítka', 10: 'desítka', 11: 'kluk', 12: 'dáma', 13: 'král',
};

/** `srdce-12-0` (suit-rank-deck) or `zolik-2`. */
export type FrenchCardId = string;

export type FrenchCard =
  | { id: FrenchCardId; joker: false; suit: FrenchSuit; rank: FrenchRank; deck: 0 | 1 }
  | { id: FrenchCardId; joker: true; deck: 0 | 1 };

export function frenchCard(id: string): FrenchCard {
  const parts = id.split('-');
  if (parts[0] === 'zolik' && parts.length === 2) {
    const n = Number(parts[1]);
    if (!Number.isInteger(n) || n < 0 || n > 3) throw new Error(`[karty-hra] unknown card ${id}`);
    return { id, joker: true, deck: (n % 2) as 0 | 1 };
  }
  const [suit, rankText, deckText] = parts;
  const rank = Number(rankText);
  const deck = Number(deckText);
  if (parts.length !== 3 || !(FRENCH_SUITS as readonly string[]).includes(suit) || !(rank >= 1 && rank <= 13) || !(deck === 0 || deck === 1)) {
    throw new Error(`[karty-hra] unknown card ${id}`);
  }
  return { id, joker: false, suit: suit as FrenchSuit, rank: rank as FrenchRank, deck: deck as 0 | 1 };
}

export function isFrenchCardId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  try {
    frenchCard(id);
    return true;
  } catch {
    return false;
  }
}

export function isJoker(id: string): boolean {
  return id.startsWith('zolik-');
}

/** Czech card name with the suit symbol, e.g. „dáma ♥“, „žolík“. */
export function frenchCardName(id: string): string {
  const c = frenchCard(id);
  if (c.joker) return 'žolík';
  return `${FRENCH_RANK_NAMES[c.rank]} ${FRENCH_SUIT_SYMBOL[c.suit]}`;
}

export function frenchRankName(rank: FrenchRank): string {
  return FRENCH_RANK_NAMES[rank];
}

/** Two 52-card decks and four jokers (108 cards). */
export function zolikyDeck(): FrenchCardId[] {
  const out: FrenchCardId[] = [];
  for (const deck of [0, 1]) {
    for (const suit of FRENCH_SUITS) for (let rank = 1; rank <= 13; rank++) out.push(`${suit}-${rank}-${deck}`);
  }
  for (let j = 0; j < 4; j++) out.push(`zolik-${j}`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Míchání

/** Seeded shuffle of any deck: the same seed always deals the same cards. */
export function shuffleDeck<T>(deck: readonly T[], seed: number): T[] {
  return shuffle(deck, mulberry32(seed));
}

/** Next seed derived from a seed (for reshuffles and further deals inside one game). */
export function nextSeed(seed: number, salt: number): number {
  const r = mulberry32((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
  return Math.floor(r() * 4294967296) >>> 0;
}
