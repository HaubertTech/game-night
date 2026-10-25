// Žolíky combinations: what is a valid run (postupka) or group (trojice/čtveřice), what it is
// worth for the first lay-down, how cards are laid off and a joker exchanged, and a search for
// the best combinations in a hand (used by the computer players and the "find combinations"
// helper). Pure functions over card ids from cards.ts.

import { FRENCH_SUITS, frenchCard, isJoker, type FrenchCardId, type FrenchSuit } from './cards.ts';

/** Card values used for the lay-down minimum and for the points left in hand. */
export interface CardValues {
  /** Ace in a group, ace above the king (Q-K-A) and ace left in hand. */
  ace: number;
  /** Ace below the two (A-2-3) inside a run. */
  aceLow: number;
  /** J, Q, K. */
  face: number;
  /** Joker left in hand (in a combination it is worth the card it stands for). */
  joker: number;
}

export const DEFAULT_CARD_VALUES: CardValues = { ace: 10, aceLow: 1, face: 10, joker: 50 };

/** One position of a combination. `rank` 1–14 (14 = ace above the king); a joker in a group has no suit. */
export interface MeldSlot {
  id: FrenchCardId;
  rank: number;
  suit: FrenchSuit | null;
  joker: boolean;
}

export interface MeldShape {
  kind: 'run' | 'group';
  slots: MeldSlot[];
}

export type MeldError =
  | 'tooShort'
  | 'tooFewNatural'
  | 'mixed'
  | 'duplicateSuit'
  | 'duplicateRank'
  | 'tooLong'
  | 'gap'
  | 'duplicateCard'
  | 'doesNotFit'
  | 'noJoker';

export type MeldCheck = { ok: true; shape: MeldShape } | { ok: false; error: MeldError };

export const MELD_ERROR_TEXT: Record<MeldError, string> = {
  tooShort: 'Skupina musí mít aspoň tři karty.',
  tooFewNatural: 'Ve skupině musí být aspoň dvě pravé karty, ne jen žolíci.',
  mixed: 'Postupka musí být v jedné barvě, trojice musí mít stejnou hodnotu.',
  duplicateSuit: 'V trojici nebo čtveřici musí mít každá karta jinou barvu.',
  duplicateRank: 'V postupce nesmí být dvě stejné karty.',
  tooLong: 'Tolik karet se do skupiny nevejde.',
  gap: 'V postupce chybí karta a žolíků není dost na mezeru.',
  duplicateCard: 'Jedna karta je ve výběru dvakrát.',
  doesNotFit: 'Tahle karta k té skupině nepasuje.',
  noJoker: 'V téhle skupině není žolík, kterého bys mohl vyměnit.',
};

interface Natural {
  id: FrenchCardId;
  suit: FrenchSuit;
  rank: number;
}

function split(ids: readonly string[]): { naturals: Natural[]; jokers: FrenchCardId[] } {
  const naturals: Natural[] = [];
  const jokers: FrenchCardId[] = [];
  for (const id of ids) {
    const c = frenchCard(id);
    if (c.joker) jokers.push(id);
    else naturals.push({ id, suit: c.suit, rank: c.rank });
  }
  return { naturals, jokers };
}

function placeRun(naturals: Natural[], jokers: FrenchCardId[], aceHigh: boolean): MeldCheck {
  const suit = naturals[0].suit;
  const cards = naturals.map((n) => ({ ...n, rank: n.rank === 1 && aceHigh ? 14 : n.rank })).sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < cards.length; i++) if (cards[i].rank === cards[i - 1].rank) return { ok: false, error: 'duplicateRank' };
  let lo = cards[0].rank;
  let hi = cards[cards.length - 1].rank;
  const gaps = hi - lo + 1 - cards.length;
  if (gaps > jokers.length) return { ok: false, error: 'gap' };
  let extra = jokers.length - gaps;
  // Spare jokers go above the highest card first, then below; no wrapping K-A-2.
  const maxHi = lo === 1 ? 13 : 14;
  while (extra > 0 && hi < maxHi) {
    hi++;
    extra--;
  }
  const minLo = hi === 14 ? 2 : 1;
  while (extra > 0 && lo > minLo) {
    lo--;
    extra--;
  }
  if (extra > 0 || hi - lo + 1 > 13) return { ok: false, error: 'tooLong' };
  const byRank = new Map(cards.map((c) => [c.rank, c]));
  const free = jokers.slice();
  const slots: MeldSlot[] = [];
  for (let r = lo; r <= hi; r++) {
    const n = byRank.get(r);
    if (n) slots.push({ id: n.id, rank: r, suit, joker: false });
    else slots.push({ id: free.shift()!, rank: r, suit, joker: true });
  }
  return { ok: true, shape: { kind: 'run', slots } };
}

/** Is this set of cards a valid combination, and how is it laid out? */
export function analyzeMeld(ids: readonly string[]): MeldCheck {
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'duplicateCard' };
  if (ids.length < 3) return { ok: false, error: 'tooShort' };
  const { naturals, jokers } = split(ids);
  if (naturals.length < 2) return { ok: false, error: 'tooFewNatural' };
  const sameRank = naturals.every((n) => n.rank === naturals[0].rank);
  if (sameRank) {
    if (new Set(naturals.map((n) => n.suit)).size !== naturals.length) return { ok: false, error: 'duplicateSuit' };
    if (ids.length > 4) return { ok: false, error: 'tooLong' };
    const slots: MeldSlot[] = [
      ...naturals.map((n) => ({ id: n.id, rank: n.rank, suit: n.suit, joker: false })),
      ...jokers.map((id) => ({ id, rank: naturals[0].rank, suit: null, joker: true })),
    ];
    return { ok: true, shape: { kind: 'group', slots } };
  }
  if (!naturals.every((n) => n.suit === naturals[0].suit)) return { ok: false, error: 'mixed' };
  const low = placeRun(naturals, jokers, false);
  if (low.ok || !naturals.some((n) => n.rank === 1)) return low;
  return placeRun(naturals, jokers, true);
}

export function slotValue(slot: MeldSlot, kind: MeldShape['kind'], values: CardValues = DEFAULT_CARD_VALUES): number {
  if (slot.rank === 14) return values.ace;
  if (slot.rank === 1) return kind === 'run' ? values.aceLow : values.ace;
  if (slot.rank >= 11) return values.face;
  return slot.rank;
}

/** Points of a combination for the first lay-down (a joker counts as the card it stands for). */
export function meldValue(shape: MeldShape, values: CardValues = DEFAULT_CARD_VALUES): number {
  return shape.slots.reduce((sum, s) => sum + slotValue(s, shape.kind, values), 0);
}

/** A run without any joker (čistá postupka). */
export function isPureRun(shape: MeldShape): boolean {
  return shape.kind === 'run' && shape.slots.every((s) => !s.joker);
}

/** Points of one card left in hand at the end of a round. */
export function cardPenalty(id: string, values: CardValues = DEFAULT_CARD_VALUES): number {
  const c = frenchCard(id);
  if (c.joker) return values.joker;
  if (c.rank === 1) return values.ace;
  if (c.rank >= 11) return values.face;
  return c.rank;
}

export function handPoints(ids: readonly string[], values: CardValues = DEFAULT_CARD_VALUES): number {
  return ids.reduce((sum, id) => sum + cardPenalty(id, values), 0);
}

export interface OpeningCheck {
  ok: boolean;
  points: number;
  hasPureRun: boolean;
  /** Per combination (same order as the input): the shape or why it is not valid. */
  melds: MeldCheck[];
  reason: string | null;
}

/** First lay-down: every combination valid, together at least `min` points, and a pure run when required. */
export function checkOpening(
  melds: readonly (readonly string[])[],
  opts: { min: number; requirePureRun: boolean; values?: CardValues },
): OpeningCheck {
  const checks = melds.map((m) => analyzeMeld(m));
  const all = melds.flat();
  let points = 0;
  let hasPureRun = false;
  for (const c of checks) {
    if (!c.ok) continue;
    points += meldValue(c.shape, opts.values);
    if (isPureRun(c.shape)) hasPureRun = true;
  }
  let reason: string | null = null;
  const bad = checks.find((c) => !c.ok);
  if (melds.length === 0) reason = 'Vyber aspoň jednu skupinu karet.';
  else if (new Set(all).size !== all.length) reason = MELD_ERROR_TEXT.duplicateCard;
  else if (bad && !bad.ok) reason = MELD_ERROR_TEXT[bad.error];
  else if (points < opts.min) reason = `Poprvé musíš vyložit aspoň ${opts.min} bodů, máš ${points}.`;
  else if (opts.requirePureRun && !hasPureRun) reason = 'Poprvé musí být mezi kartami čistá postupka — tři karty po sobě bez žolíka.';
  return { ok: reason === null, points, hasPureRun, melds: checks, reason };
}

// ---------------------------------------------------------------------------------------------
// Laying off and joker exchange on a combination already on the table

/** Adds cards to a combination on the table; jokers already there keep their place. */
export function layOff(shape: MeldShape, ids: readonly string[]): MeldCheck {
  const used = new Set(shape.slots.map((s) => s.id));
  if (ids.length === 0 || ids.some((id) => used.has(id)) || new Set(ids).size !== ids.length) return { ok: false, error: 'duplicateCard' };
  const { naturals, jokers } = split(ids);
  if (shape.kind === 'group') {
    const rank = shape.slots[0].rank;
    const suits = new Set(shape.slots.filter((s) => !s.joker).map((s) => s.suit));
    const slots = shape.slots.slice();
    for (const n of naturals) {
      if (n.rank !== rank || suits.has(n.suit)) return { ok: false, error: 'doesNotFit' };
      suits.add(n.suit);
      slots.push({ id: n.id, rank, suit: n.suit, joker: false });
    }
    for (const id of jokers) slots.push({ id, rank, suit: null, joker: true });
    if (slots.length > 4) return { ok: false, error: 'tooLong' };
    return { ok: true, shape: { kind: 'group', slots } };
  }
  const suit = shape.slots[0].suit as FrenchSuit;
  let slots = shape.slots.slice();
  const pending = naturals.slice();
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const n = pending[i];
      if (n.suit !== suit) return { ok: false, error: 'doesNotFit' };
      const lo = slots[0].rank;
      const hi = slots[slots.length - 1].rank;
      const asLow = n.rank === lo - 1 && !(n.rank === 1 && hi === 14);
      const asHigh = (n.rank === hi + 1 || (n.rank === 1 && hi === 13)) && lo !== 1;
      if (asHigh) slots = [...slots, { id: n.id, rank: hi + 1, suit, joker: false }];
      else if (asLow) slots = [{ id: n.id, rank: lo - 1, suit, joker: false }, ...slots];
      else continue;
      pending.splice(i, 1);
      progress = true;
      break;
    }
  }
  if (pending.length) return { ok: false, error: 'doesNotFit' };
  for (const id of jokers) {
    const lo = slots[0].rank;
    const hi = slots[slots.length - 1].rank;
    if (hi < 14 && !(lo === 1 && hi === 13)) slots = [...slots, { id, rank: hi + 1, suit, joker: true }];
    else if (lo > 1 && !(hi === 14 && lo === 2)) slots = [{ id, rank: lo - 1, suit, joker: true }, ...slots];
    else return { ok: false, error: 'tooLong' };
  }
  return { ok: true, shape: { kind: 'run', slots } };
}

/** The real card a joker in a run stands for (`srdce-7`), or null in a group. */
export function jokerStandsFor(shape: MeldShape, slot: MeldSlot): { suit: FrenchSuit; rank: number } | null {
  if (!slot.joker || shape.kind !== 'run' || !slot.suit) return null;
  return { suit: slot.suit, rank: slot.rank === 14 ? 1 : slot.rank };
}

/** Suits a group still misses (a joker in a group stands for one of them). */
export function groupMissingSuits(shape: MeldShape): FrenchSuit[] {
  const have = new Set(shape.slots.filter((s) => !s.joker).map((s) => s.suit));
  return FRENCH_SUITS.filter((s) => !have.has(s));
}

/**
 * Exchange of a joker. Run: one real card for the joker it stands for. Group: real cards of all
 * missing suits, then every joker of the group comes back. Returns the new combination and the
 * freed jokers.
 */
export function swapJoker(shape: MeldShape, ids: readonly string[]): { ok: true; shape: MeldShape; freed: FrenchCardId[] } | { ok: false; error: MeldError } {
  if (!shape.slots.some((s) => s.joker)) return { ok: false, error: 'noJoker' };
  const { naturals, jokers } = split(ids);
  if (jokers.length || naturals.length === 0) return { ok: false, error: 'doesNotFit' };
  if (shape.kind === 'run') {
    if (naturals.length !== 1) return { ok: false, error: 'doesNotFit' };
    const n = naturals[0];
    const index = shape.slots.findIndex((s) => {
      const f = jokerStandsFor(shape, s);
      return f !== null && f.suit === n.suit && f.rank === n.rank;
    });
    if (index < 0) return { ok: false, error: 'doesNotFit' };
    const slots = shape.slots.slice();
    const freed = [slots[index].id];
    slots[index] = { id: n.id, rank: slots[index].rank, suit: n.suit, joker: false };
    return { ok: true, shape: { kind: 'run', slots }, freed };
  }
  const rank = shape.slots.find((s) => !s.joker)!.rank;
  const missing = groupMissingSuits(shape);
  const given = naturals.map((n) => n.suit);
  if (naturals.some((n) => n.rank !== rank) || new Set(given).size !== given.length || given.length !== missing.length || !missing.every((s) => given.includes(s))) {
    return { ok: false, error: 'doesNotFit' };
  }
  const freed = shape.slots.filter((s) => s.joker).map((s) => s.id);
  const slots: MeldSlot[] = [
    ...shape.slots.filter((s) => !s.joker),
    ...naturals.map((n) => ({ id: n.id, rank, suit: n.suit, joker: false })),
  ];
  return { ok: true, shape: { kind: 'group', slots }, freed };
}

// ---------------------------------------------------------------------------------------------
// Search: the best set of combinations in a hand

interface Candidate {
  kind: 'run' | 'group';
  /** `${suit}-${rank}` of the real cards (rank 1–13). */
  keys: string[];
  jokers: number;
  /** Points of the cards it removes from the hand. */
  cover: number;
  /** Value for the first lay-down. */
  value: number;
  pure: boolean;
}

export interface MeldPlan {
  melds: FrenchCardId[][];
  /** Lay-down value of the combinations. */
  value: number;
  /** Hand points the combinations remove. */
  cover: number;
  hasPureRun: boolean;
  rest: FrenchCardId[];
}

function keyOf(suit: FrenchSuit, rank: number): string {
  return `${suit}-${rank}`;
}

function rankPenalty(rank: number, values: CardValues): number {
  if (rank === 1) return values.ace;
  if (rank >= 11) return values.face;
  return rank;
}

function candidates(hand: readonly string[], values: CardValues): { list: Candidate[]; counts: Map<string, number>; jokers: number } {
  const counts = new Map<string, number>();
  let jokers = 0;
  for (const id of hand) {
    const c = frenchCard(id);
    if (c.joker) jokers++;
    else counts.set(keyOf(c.suit, c.rank), (counts.get(keyOf(c.suit, c.rank)) ?? 0) + 1);
  }
  const list: Candidate[] = [];
  for (const suit of FRENCH_SUITS) {
    for (let lo = 1; lo <= 12; lo++) {
      const maxHi = lo === 1 ? 13 : 14;
      for (let hi = lo + 2; hi <= Math.min(maxHi, lo + 12); hi++) {
        const keys: string[] = [];
        let missing = 0;
        let value = 0;
        let cover = 0;
        for (let r = lo; r <= hi; r++) {
          const real = r === 14 ? 1 : r;
          const v = r === 1 ? values.aceLow : r === 14 ? values.ace : r >= 11 ? values.face : r;
          value += v;
          if (counts.get(keyOf(suit, real))) {
            keys.push(keyOf(suit, real));
            cover += rankPenalty(real, values);
          } else missing++;
        }
        if (missing > jokers) break;
        if (keys.length < 2) continue;
        list.push({ kind: 'run', keys, jokers: missing, cover: cover + missing * values.joker, value, pure: missing === 0 });
      }
    }
  }
  for (let rank = 1; rank <= 13; rank++) {
    const suits = FRENCH_SUITS.filter((s) => counts.get(keyOf(s, rank)));
    const n = suits.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const chosen = suits.filter((_, i) => mask & (1 << i));
      if (chosen.length < 2) continue;
      for (let j = 0; j <= Math.min(jokers, 4 - chosen.length); j++) {
        const size = chosen.length + j;
        if (size < 3) continue;
        const v = rankPenalty(rank, values);
        list.push({ kind: 'group', keys: chosen.map((s) => keyOf(s, rank)), jokers: j, cover: chosen.length * v + j * values.joker, value: size * v, pure: false });
      }
    }
  }
  list.sort((a, b) => b.cover - a.cover || b.value - a.value);
  return { list, counts, jokers };
}

export interface PlanOptions {
  values?: CardValues;
  /** Also find the best plan that satisfies the first lay-down. */
  opening?: { min: number; requirePureRun: boolean };
  /** Search budget (nodes). */
  budget?: number;
  /** Cards that must be in the combinations (e.g. the card taken from the discard pile). */
  mustUse?: string[];
}

function materialize(hand: readonly string[], chosen: Candidate[], prefer: readonly string[] = []): MeldPlan & { ok: boolean } {
  const pool = new Map<string, string[]>();
  const jokerIds: string[] = [];
  // Preferred cards (e.g. the one taken from the discard pile) are used before their twins.
  const ordered = [...prefer.filter((id) => hand.includes(id)), ...hand.filter((id) => !prefer.includes(id))];
  for (const id of ordered) {
    const c = frenchCard(id);
    if (c.joker) jokerIds.push(id);
    else {
      const k = keyOf(c.suit, c.rank);
      pool.set(k, [...(pool.get(k) ?? []), id]);
    }
  }
  const melds: string[][] = [];
  let value = 0;
  let cover = 0;
  let hasPureRun = false;
  for (const cand of chosen) {
    const ids = cand.keys.map((k) => pool.get(k)!.shift()!);
    for (let j = 0; j < cand.jokers; j++) ids.push(jokerIds.shift()!);
    const check = analyzeMeld(ids);
    if (!check.ok) return { melds: [], value: 0, cover: 0, hasPureRun: false, rest: [...hand], ok: false };
    melds.push(check.shape.slots.map((s) => s.id));
    value += cand.value;
    cover += cand.cover;
    if (cand.pure) hasPureRun = true;
  }
  const used = new Set(melds.flat());
  return { melds, value, cover, hasPureRun, rest: hand.filter((id) => !used.has(id)), ok: true };
}

/**
 * Best disjoint combinations in a hand: the most hand points removed (ties: higher lay-down
 * value). With `opening`, `opening` holds the best plan that is a valid first lay-down (or null).
 */
export function planMelds(hand: readonly string[], opts: PlanOptions = {}): { best: MeldPlan; opening: MeldPlan | null } {
  const values = opts.values ?? DEFAULT_CARD_VALUES;
  const { list, counts, jokers } = candidates(hand, values);
  const must = (opts.mustUse ?? []).map((id) => {
    const c = frenchCard(id);
    return c.joker ? 'J' : keyOf(c.suit, c.rank);
  });
  const budget = opts.budget ?? 40000;
  let nodes = 0;
  const totalCover = handPoints(hand, values);
  let best: { cover: number; value: number; chosen: Candidate[] } = { cover: 0, value: 0, chosen: [] };
  let bestOpen: { cover: number; value: number; chosen: Candidate[] } | null = null;
  const chosen: Candidate[] = [];
  const left = new Map(counts);
  let jokersLeft = jokers;

  const mustSatisfied = (): boolean =>
    must.every((k) => (k === 'J' ? jokersLeft < jokers : (left.get(k) ?? 0) < (counts.get(k) ?? 0)));

  function consider(cover: number, value: number, pure: boolean) {
    if (!mustSatisfied()) return;
    if (cover > best.cover || (cover === best.cover && value > best.value)) best = { cover, value, chosen: chosen.slice() };
    if (opts.opening && value >= opts.opening.min && (pure || !opts.opening.requirePureRun)) {
      if (!bestOpen || cover > bestOpen.cover || (cover === bestOpen.cover && value > bestOpen.value)) {
        bestOpen = { cover, value, chosen: chosen.slice() };
      }
    }
  }

  function dfs(start: number, cover: number, value: number, pure: boolean, remaining: number) {
    nodes++;
    consider(cover, value, pure);
    if (nodes > budget) return;
    const openCover = (bestOpen as { cover: number } | null)?.cover;
    if (cover + remaining <= best.cover && (!opts.opening || (openCover !== undefined && cover + remaining <= openCover))) return;
    for (let i = start; i < list.length; i++) {
      const c = list[i];
      if (c.jokers > jokersLeft) continue;
      if (!c.keys.every((k) => (left.get(k) ?? 0) > 0)) continue;
      for (const k of c.keys) left.set(k, left.get(k)! - 1);
      jokersLeft -= c.jokers;
      chosen.push(c);
      dfs(i, cover + c.cover, value + c.value, pure || c.pure, remaining - c.cover);
      chosen.pop();
      jokersLeft += c.jokers;
      for (const k of c.keys) left.set(k, left.get(k)! + 1);
      if (nodes > budget) return;
    }
  }
  dfs(0, 0, 0, false, totalCover);

  const toPlan = (b: { chosen: Candidate[] }): MeldPlan => {
    const m = materialize(hand, b.chosen, opts.mustUse);
    return { melds: m.melds, value: m.value, cover: m.cover, hasPureRun: m.hasPureRun, rest: m.rest };
  };
  const open = bestOpen as { cover: number; value: number; chosen: Candidate[] } | null;
  return { best: toPlan(best), opening: open ? toPlan(open) : null };
}

/** Real card ids in `hand` matching a suit/rank (rank 1–13). */
export function findCard(hand: readonly string[], suit: FrenchSuit, rank: number): FrenchCardId | null {
  return (
    hand.find((id) => {
      if (isJoker(id)) return false;
      const c = frenchCard(id);
      return !c.joker && c.suit === suit && c.rank === rank;
    }) ?? null
  );
}
