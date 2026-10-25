// Computer players for žolíky in three strengths. One call returns the next single command of
// the current turn (take a card → lay down / lay off / exchange a joker → discard), so the UI
// can animate step by step. Deterministic for a given state. Every command comes with a short
// Czech sentence, used by the "Poraď" button.
//
// 1 (začátečník) — always draws from the stock, lays down what it finds, lays off only on its
//                  own combinations, discards a random spare card.
// 2 (hráč)       — searches the best split of its hand into combinations (zoliky-melds.ts),
//                  after its first lay-down takes from the discard pile when the card fits, lays
//                  off anywhere, discards the least useful high card.
// 3 (mistr)      — like 2, plus: takes a discarded card to lay down for the first time, exchanges
//                  jokers, waits with the first lay-down when it is close to closing from hand
//                  (×2 for the others), counts cards already out of play and does not feed the
//                  next player.

import { mulberry32, seedFromString } from '../../../engine/rng.ts';
import { frenchCard, frenchCardName, isJoker, type FrenchCardId } from '../cards.ts';
import type { AiLevel, ZolikyCommand, ZolikyGameState } from '../zoliky-engine.ts';
import { topDiscard } from '../zoliky-engine.ts';
import {
  analyzeMeld,
  cardPenalty,
  checkOpening,
  findCard,
  groupMissingSuits,
  jokerStandsFor,
  layOff,
  meldValue,
  planMelds,
  type MeldPlan,
} from '../zoliky-melds.ts';

export interface ZolikyAdvice {
  command: Exclude<ZolikyCommand, { type: 'nextRound' | 'resetTurn' }>;
  reason: string;
}

function rngFor(state: ZolikyGameState, playerId: string) {
  return mulberry32(seedFromString(`${state.seed}:${state.roundIndex}:${state.seq}:${playerId}`));
}

function openingOpts(state: ZolikyGameState) {
  return { min: state.settings.openingMin, requirePureRun: state.settings.requirePureRun };
}

function describeMelds(melds: string[][]): string {
  return melds.map((m) => m.map((id) => frenchCardName(id)).join(', ')).join(' | ');
}

/** Removes one card from a plan that would use the whole hand (the last card closes by discard). */
function keepOneCard(state: ZolikyGameState, hand: readonly string[], plan: MeldPlan, opening: boolean): string[][] | null {
  if (plan.rest.length > 0) return plan.melds;
  const values = state.settings.values;
  const options: { melds: string[][]; drop: number }[] = [];
  plan.melds.forEach((meld, i) => {
    if (meld.length >= 4) {
      for (const pos of [0, meld.length - 1]) {
        const trimmed = meld.filter((_, j) => j !== pos);
        if (analyzeMeld(trimmed).ok && !isJoker(meld[pos])) {
          options.push({ melds: plan.melds.map((m, k) => (k === i ? trimmed : m)), drop: cardPenalty(meld[pos], values) });
        }
      }
    }
    options.push({ melds: plan.melds.filter((_, k) => k !== i), drop: meld.reduce((s, id) => s + cardPenalty(id, values), 0) });
  });
  options.sort((a, b) => a.drop - b.drop);
  for (const o of options) {
    if (o.melds.length === 0) continue;
    if (opening && !checkOpening(o.melds, { ...openingOpts(state), values }).ok) continue;
    if (o.melds.flat().length < hand.length) return o.melds;
  }
  return null;
}

/** Index of a table combination the card can be laid off to (or -1). */
function layOffTarget(state: ZolikyGameState, playerId: string, cardId: string, ownOnly: boolean): number {
  return state.melds.findIndex((m) => (!ownOnly || m.owner === playerId) && layOff(m, [cardId]).ok);
}

/** A joker exchange the player can make now. */
function jokerSwap(state: ZolikyGameState, hand: readonly string[]): { meldId: string; cardIds: string[] } | null {
  for (const meld of state.melds) {
    if (!meld.slots.some((s) => s.joker)) continue;
    if (meld.kind === 'run') {
      for (const slot of meld.slots) {
        const f = jokerStandsFor(meld, slot);
        if (!f) continue;
        const card = findCard(hand, f.suit, f.rank);
        if (card) return { meldId: meld.id, cardIds: [card] };
      }
    } else {
      const rank = meld.slots.find((s) => !s.joker)!.rank;
      const cards = groupMissingSuits(meld).map((suit) => findCard(hand, suit, rank));
      if (cards.every((c) => c !== null)) return { meldId: meld.id, cardIds: cards as string[] };
    }
  }
  return null;
}

/** Copies of each real card already out of play (discard pile and table), by `suit-rank`. */
function deadCards(state: ZolikyGameState): Map<string, number> {
  const dead = new Map<string, number>();
  const add = (id: string) => {
    const c = frenchCard(id);
    if (c.joker) return;
    const k = `${c.suit}-${c.rank}`;
    dead.set(k, (dead.get(k) ?? 0) + 1);
  };
  for (const id of state.discard) add(id);
  for (const m of state.melds) for (const s of m.slots) if (!s.joker) add(s.id);
  return dead;
}

/** How useful a spare card is to keep (close to a combination); with `dead`, hopeless pairs count less. */
function keepScore(hand: readonly string[], id: string, dead: Map<string, number> | null): number {
  if (isJoker(id)) return 100;
  const c = frenchCard(id);
  if (c.joker) return 100;
  const live = (suit: string, rank: number): number => {
    if (rank < 1 || rank > 14) return 0;
    const r = rank === 14 ? 1 : rank;
    return dead ? Math.max(0, 2 - (dead.get(`${suit}-${r}`) ?? 0)) : 1;
  };
  const jokers = hand.filter((h) => isJoker(h)).length;
  let score = 0;
  for (const other of hand) {
    if (other === id || isJoker(other)) continue;
    const o = frenchCard(other);
    if (o.joker) continue;
    let chance = 0;
    let weight = 0;
    if (o.suit === c.suit && o.rank !== c.rank) {
      const lo = Math.min(o.rank, c.rank);
      const hi = Math.max(o.rank, c.rank);
      if (hi - lo === 1) {
        weight = 3;
        chance = live(c.suit, lo - 1) + live(c.suit, hi + 1);
      } else if (hi - lo === 2) {
        weight = 2;
        chance = live(c.suit, lo + 1);
      }
    } else if (o.rank === c.rank && o.suit !== c.suit) {
      weight = 3;
      for (const suit of ['srdce', 'kary', 'krize', 'piky']) if (suit !== c.suit && suit !== o.suit) chance += live(suit, c.rank);
    }
    if (weight && (chance > 0 || jokers > 0)) score += dead ? weight * Math.min(1, (chance + jokers) / 2) : weight;
  }
  return score;
}

/** Does a card help the player after us (taken cards near it, or it fits their table combinations)? */
function feedsNext(state: ZolikyGameState, playerId: string, id: string): number {
  const i = state.players.findIndex((p) => p.id === playerId);
  const next = state.players[(i + 1) % state.players.length].id;
  const c = frenchCard(id);
  if (c.joker) return 10;
  let risk = 0;
  for (const t of state.taken) {
    if (t.playerId !== next || isJoker(t.cardId)) continue;
    const o = frenchCard(t.cardId);
    if (o.joker) continue;
    if (o.rank === c.rank || (o.suit === c.suit && Math.abs(o.rank - c.rank) <= 2)) risk += 4;
  }
  if (state.opened[next] && state.melds.some((m) => layOff(m, [id]).ok)) risk += 5;
  return risk;
}

function chooseDiscard(state: ZolikyGameState, playerId: string, level: AiLevel): ZolikyAdvice {
  const hand = state.hands[playerId];
  const values = state.settings.values;
  let options = hand.filter((id) => !(state.tookDiscard && id === state.tookDiscard));
  if (options.length === 0) options = hand.slice();
  const nonJoker = options.filter((id) => !isJoker(id));
  if (nonJoker.length) options = nonJoker;
  // Keep the cards of the best combinations still in hand (not laid down yet).
  const planned = new Set(planMelds(hand, { values, budget: 8000 }).best.melds.flat());
  const spare = options.filter((id) => !planned.has(id));
  if (spare.length) options = spare;

  if (level === 1) {
    const id = options[Math.floor(rngFor(state, playerId)() * options.length)];
    return { command: { type: 'discard', cardId: id }, reason: `Odhoď ${frenchCardName(id)}.` };
  }
  let best = options[0];
  let bestScore = -Infinity;
  const dead = level === 3 ? deadCards(state) : null;
  for (const id of options) {
    let score = cardPenalty(id, values) - keepScore(hand, id, dead) * 4;
    if (level === 3) score -= feedsNext(state, playerId, id) * 3;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  const closing = hand.length === 1;
  const reason = closing
    ? `Odhoď poslední kartu (${frenchCardName(best)}) a zavíráš!`
    : `Odhoď ${frenchCardName(best)} — do žádné skupiny se ti nehodí a v ruce by ti strašila za ${cardPenalty(best, values)} bodů.`;
  return { command: { type: 'discard', cardId: best }, reason };
}

function chooseDraw(state: ZolikyGameState, playerId: string, level: AiLevel): ZolikyAdvice {
  const top = topDiscard(state);
  const hand = state.hands[playerId];
  const values = state.settings.values;
  const stock: ZolikyAdvice = { command: { type: 'drawStock' }, reason: 'Vezmi si kartu z balíčku.' };
  if (!top || level === 1) return stock;
  const withTop = [...hand, top];
  if (state.opened[playerId]) {
    if (isJoker(top)) return { command: { type: 'takeDiscard' }, reason: 'Vezmi si žolíka z odhozených — zastoupí ti jakoukoli kartu.' };
    const before = planMelds(hand, { values, budget: 8000 }).best.cover;
    const after = planMelds(withTop, { values, budget: 8000, mustUse: [top] }).best;
    const fits = layOffTarget(state, playerId, top, false) >= 0;
    if ((after.cover > before && after.melds.flat().includes(top)) || fits) {
      return { command: { type: 'takeDiscard' }, reason: `Vezmi si ${frenchCardName(top)} z odhozených — hned ji využiješ.` };
    }
    return stock;
  }
  if (level === 2) return stock;
  const opening = planMelds(withTop, { values, opening: openingOpts(state), mustUse: [top], budget: 20000 }).opening;
  if (opening && opening.melds.flat().includes(top) && keepOneCard(state, withTop, opening, true)) {
    return { command: { type: 'takeDiscard' }, reason: `Vezmi si ${frenchCardName(top)} z odhozených — s ní můžeš poprvé vyložit ${opening.value} bodů.` };
  }
  return stock;
}

/** Next command of the player's turn. */
export function chooseZolikyCommand(state: ZolikyGameState, playerId: string, level: AiLevel): ZolikyAdvice {
  if (state.step === 'draw') return chooseDraw(state, playerId, level);
  const hand = state.hands[playerId];
  const values = state.settings.values;

  if (!state.opened[playerId]) {
    const must = state.tookDiscard && hand.includes(state.tookDiscard) ? [state.tookDiscard] : [];
    const plan = planMelds(hand, { values, opening: openingOpts(state), mustUse: must, budget: 30000 }).opening;
    if (plan) {
      const melds = keepOneCard(state, hand, plan, true);
      const waitForHand =
        level === 3 &&
        must.length === 0 &&
        melds !== null &&
        hand.length - melds.flat().length >= 2 &&
        hand.length - melds.flat().length <= 3 &&
        state.turnCount < state.players.length * 5 &&
        !state.players.some((p) => p.id !== playerId && state.hands[p.id].length <= 4);
      if (melds && !waitForHand) {
        const points = checkOpening(melds, { ...openingOpts(state), values }).points;
        const fromHand = hand.length - melds.flat().length === 1;
        return {
          command: { type: 'meld', melds },
          reason: fromHand
            ? `Vylož všechno najednou (${points} bodů) a poslední kartou zavři z ruky — ostatní mají body dvakrát!`
            : `Můžeš poprvé vyložit: ${describeMelds(melds)} — dohromady ${points} bodů.`,
        };
      }
    }
    return chooseDiscard(state, playerId, level);
  }

  if (level === 3) {
    const swap = jokerSwap(state, hand);
    if (swap) {
      return {
        command: { type: 'swapJoker', meldId: swap.meldId, cardIds: swap.cardIds },
        reason: `Vyměň žolíka na stole za ${swap.cardIds.map((id) => frenchCardName(id)).join(' a ')} — žolíka si vezmeš do ruky.`,
      };
    }
  }

  const best = planMelds(hand, { values, budget: 20000 }).best;
  if (best.melds.length) {
    const melds = keepOneCard(state, hand, best, false);
    if (melds && melds.length) return { command: { type: 'meld', melds }, reason: `Vylož ${describeMelds(melds)}.` };
  }

  if (hand.length > 1) {
    const ordered = [...hand].sort((a, b) => Number(isJoker(a)) - Number(isJoker(b)));
    for (const id of ordered) {
      if (isJoker(id) && hand.length > 3) continue;
      const target = layOffTarget(state, playerId, id, level === 1);
      if (target >= 0) {
        return { command: { type: 'layOff', meldId: state.melds[target].id, cardIds: [id] }, reason: `Přilož ${frenchCardName(id)} k vyložené skupině na stole.` };
      }
    }
  }
  return chooseDiscard(state, playerId, level);
}

/** Combinations the player could lay down now (the "najdi kombinace" helper); one card always stays for the discard. */
export function suggestMelds(state: ZolikyGameState, playerId: string): { plan: MeldPlan; opening: MeldPlan | null } {
  const hand = state.hands[playerId] ?? [];
  const values = state.settings.values;
  const must = state.tookDiscard && hand.includes(state.tookDiscard) ? [state.tookDiscard] : [];
  const res = planMelds(hand, { values, opening: openingOpts(state), budget: 30000, mustUse: must });
  const trim = (plan: MeldPlan | null, opening: boolean): MeldPlan | null => {
    if (!plan) return null;
    const melds = keepOneCard(state, hand, plan, opening);
    if (!melds) return null;
    const used = new Set(melds.flat());
    const value = melds.reduce((sum, m) => {
      const a = analyzeMeld(m);
      return sum + (a.ok ? meldValue(a.shape, values) : 0);
    }, 0);
    return { ...plan, melds, value, rest: hand.filter((id) => !used.has(id)) };
  };
  return { plan: trim(res.best, false) ?? { ...res.best, melds: [], value: 0 }, opening: trim(res.opening, true) };
}

export type { FrenchCardId };
