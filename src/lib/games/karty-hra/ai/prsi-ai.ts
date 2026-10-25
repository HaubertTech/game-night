// Computer players for prší in three strengths. Deterministic: the only randomness comes from a
// PRNG seeded by the game seed and the move number. Every choice comes with one simple Czech
// sentence, so the same code answers the "Poraď" button in the learning mode.
//
// 1 (začátečník) — any playable card, random suit for a svršek.
// 2 (hráč)       — saves svršky, answers sevens and aces, keeps the suit it holds most of.
// 3 (mistr)      — like 2, plus: hits a player with few cards by a seven or an ace, keeps them
//                  otherwise for defence, and remembers which suits the next player could not
//                  follow (they had to draw).

import { mulberry32, seedFromString } from '../../../engine/rng.ts';
import { MARIAS_SUITS, MARIAS_SUIT_LABELS, mariasCard, mariasCardName, type MariasCardId, type MariasSuit } from '../cards.ts';
import { activeIds, penaltyCards, playableCards, type AiLevel, type PrsiCommand, type PrsiGameState } from '../prsi-engine.ts';

export type PrsiMove = Extract<PrsiCommand, { type: 'play' | 'draw' | 'stand' }>;

export interface PrsiAdvice {
  move: PrsiMove;
  /** One short sentence for a child. */
  reason: string;
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function rngFor(state: PrsiGameState, playerId: string) {
  return mulberry32(seedFromString(`${state.seed}:${state.dealIndex}:${state.seq}:${playerId}`));
}

function nextPlayerId(state: PrsiGameState, playerId: string): string {
  const ids = activeIds(state);
  const i = ids.indexOf(playerId);
  return ids[(i + 1) % ids.length];
}

function suitCounts(hand: readonly MariasCardId[]): Record<MariasSuit, number> {
  const counts = { srdce: 0, listy: 0, zaludy: 0, kule: 0 } as Record<MariasSuit, number>;
  for (const id of hand) {
    const c = mariasCard(id);
    if (c.rank !== 'svrsek') counts[c.suit]++;
  }
  return counts;
}

/** Suit to ask for with a svršek. */
export function chooseSuit(state: PrsiGameState, playerId: string, svrsek: MariasCardId, level: AiLevel): MariasSuit {
  const rest = (state.hands[playerId] ?? []).filter((c) => c !== svrsek);
  if (level === 1) return MARIAS_SUITS[Math.floor(rngFor(state, playerId)() * 4)];
  const counts = suitCounts(rest);
  const lacking = level === 3 ? new Set(state.lacking[nextPlayerId(state, playerId)] ?? []) : new Set<MariasSuit>();
  let best: MariasSuit = mariasCard(svrsek).suit;
  let bestScore = -Infinity;
  for (const suit of MARIAS_SUITS) {
    const score = counts[suit] * 10 + (lacking.has(suit) ? 4 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = suit;
    }
  }
  return best;
}

/** The move of a computer player (or the advice for a human) in the current state. */
export function choosePrsiMove(state: PrsiGameState, playerId: string, level: AiLevel): PrsiAdvice {
  const playable = playableCards(state, playerId);
  const hand = state.hands[playerId] ?? [];
  if (playable.length === 0) {
    if (state.pendingAce) return { move: { type: 'stand' }, reason: 'Na eso nemáš eso, tak jedno kolo stojíš.' };
    if (state.pendingSevens > 0) {
      return { move: { type: 'draw' }, reason: `Na sedmu nemáš sedmu, takže si bereš ${penaltyCards(state)} karty.` };
    }
    return { move: { type: 'draw' }, reason: 'Nemáš kartu stejné barvy ani hodnoty, tak si lízni.' };
  }

  if (level === 1) {
    const rand = rngFor(state, playerId);
    const cardId = playable[Math.floor(rand() * playable.length)];
    return withSuit(state, playerId, cardId, level, `${cap(mariasCardName(cardId))} se dá zahrát.`);
  }

  if (state.pendingSevens > 0) {
    const seven = playable[0];
    return {
      move: { type: 'play', cardId: seven },
      reason: `Přebij sedmu svou sedmou — jinak bys bral ${penaltyCards(state)} karty a další jich bere ${penaltyCards(state) + state.settings.drawPerSeven}.`,
    };
  }
  if (state.pendingAce) {
    return { move: { type: 'play', cardId: playable[0] }, reason: 'Přebij eso esem, ať nestojíš ty, ale další hráč.' };
  }

  const next = nextPlayerId(state, playerId);
  const nextCards = (state.hands[next] ?? []).length;
  const nextLacking = new Set(state.lacking[next] ?? []);
  const counts = suitCounts(hand);
  const duel = activeIds(state).length === 2;
  let best: { cardId: MariasCardId; score: number; reason: string } | null = null;
  for (const cardId of playable) {
    const c = mariasCard(cardId);
    const after = counts[c.suit] - (c.rank === 'svrsek' ? 0 : 1);
    let score = 10 + after * 3;
    let reason = `${cap(mariasCardName(cardId))} sedí a ${MARIAS_SUIT_LABELS[c.suit]} ti ještě zůstanou.`;
    if (after === 0 && c.rank !== 'svrsek') reason = `${cap(mariasCardName(cardId))} sedí — zbavíš se poslední karty té barvy.`;
    if (c.rank === 'svrsek') {
      score = hand.length <= 2 ? 12 : -30;
      reason = hand.length <= 2 ? `Teď je ten pravý čas na svrška — zbývá ti málo karet.` : 'Svršek si šetři, hodí se, až nebudeš mít co dát.';
    } else if (c.rank === '7') {
      if (level === 3 && nextCards <= 2) {
        score = 60;
        reason = `Dej sedmu! Další hráč má jen ${nextCards} ${nextCards === 1 ? 'kartu' : 'karty'} a bude muset brát.`;
      } else if (level === 3 && duel) {
        score = 30;
        reason = 'Dej sedmu — soupeř bude brát dvě karty, pokud nemá taky sedmu.';
      } else {
        score = level === 3 ? 4 : 12;
        if (level === 3) reason = 'Sedmu si raději nech na obranu, kdyby ti někdo dal sedmu.';
      }
    } else if (c.rank === 'eso') {
      if (level === 3 && nextCards <= 2) {
        score = 55;
        reason = `Dej eso — další hráč má málo karet a jedno kolo bude stát.`;
      } else if (level === 3 && duel) {
        score = 35;
        reason = 'Dej eso — soupeř bude stát a ty hraješ hned znovu.';
      } else {
        score = level === 3 ? 6 : 11;
      }
    }
    if (level === 3 && nextLacking.has(c.suit) && c.rank !== 'svrsek') {
      score += 6;
      reason = `${cap(mariasCardName(cardId))} — ${MARIAS_SUIT_LABELS[c.suit]} další hráč nejspíš nemá, minule musel brát.`;
    }
    if (!best || score > best.score) best = { cardId, score, reason };
  }
  const chosen = best!;
  return withSuit(state, playerId, chosen.cardId, level, chosen.reason);
}

function withSuit(state: PrsiGameState, playerId: string, cardId: MariasCardId, level: AiLevel, reason: string): PrsiAdvice {
  if (mariasCard(cardId).rank !== 'svrsek') return { move: { type: 'play', cardId }, reason };
  const suit = chooseSuit(state, playerId, cardId, level);
  const why = level === 1 ? '' : ', těch máš nejvíc';
  return { move: { type: 'play', cardId, suit }, reason: `${reason} Přej si ${MARIAS_SUIT_LABELS[suit]}${why}.` };
}
