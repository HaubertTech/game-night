// Žolíky (Czech rummy) with real cards as a pure reducer.
//
// Rules (README.md, with sources): two 52-card decks and four jokers. The player left of the
// dealer starts with one extra card and begins by discarding. A turn: take the top card of the
// stock or of the discard pile, lay down combinations / lay off / exchange a joker, discard one
// card. The first lay-down needs at least 42 points (configurable) including a pure run. A card
// from the discard pile may be taken only by someone who has laid down already, or who lays down
// with it in the same turn. Whoever gets rid of all cards (the last one discarded) closes the
// round. Family rules (Tomáš): the closer scores 0, closing from hand (everything laid down in one
// turn) doubles the others' points, a fixed number of rounds (10), the lowest total wins.
//
// The rounds are written on the score sheet of src/lib/cards/zoliky.ts, so the league result
// and the running totals are the same as for physical cards.

import { createZoliky, reduceZoliky, zolikySheet, zolikyToMatchResult, type ZolikyState } from '../../cards/zoliky.ts';
import type { MatchResult } from '../../league/types.ts';
import { frenchCardName, nextSeed, shuffleDeck, zolikyDeck, type FrenchCardId } from './cards.ts';
import type { Actor, AiLevel, TablePlayer } from './prsi-engine.ts';
import {
  DEFAULT_CARD_VALUES,
  MELD_ERROR_TEXT,
  analyzeMeld,
  checkOpening,
  handPoints,
  layOff,
  swapJoker,
  type CardValues,
  type MeldError,
  type MeldShape,
} from './zoliky-melds.ts';

export type { Actor, AiLevel, TablePlayer } from './prsi-engine.ts';

export const ZOLIKY_GAME_VERSION = 1;
export const ZOLIKY_MIN_PLAYERS = 2;
export const ZOLIKY_MAX_PLAYERS = 5;
/** Safety stop: after this many turns the round ends, the player with the fewest points "closes". */
export const ZOLIKY_TURN_LIMIT = 400;
type NoSeq<T> = T extends unknown ? Omit<T, 'seq'> : never;
const LOG_LIMIT = 60;

export interface ZolikyGameSettings {
  /** Cards per player; null = by the number of players (2: 15, 3: 14, 4+: 13). */
  handSize: number | null;
  /** Minimum points of the first lay-down. */
  openingMin: number;
  /** The first lay-down must include a run without a joker. */
  requirePureRun: boolean;
  /** Rounds in one game (house rule: 10). */
  rounds: number;
  /** Multiplier of the others' points when someone closes from hand (house rule: ×2). */
  fromHandMultiplier: number;
  values: CardValues;
}

export const DEFAULT_ZOLIKY_GAME_SETTINGS: ZolikyGameSettings = {
  handSize: null,
  openingMin: 42,
  requirePureRun: true,
  rounds: 10,
  fromHandMultiplier: 2,
  values: DEFAULT_CARD_VALUES,
};

export function handSizeFor(settings: ZolikyGameSettings, players: number): number {
  if (settings.handSize) return settings.handSize;
  return players <= 2 ? 15 : players === 3 ? 14 : 13;
}

export interface TableMeld extends MeldShape {
  id: string;
  /** Who laid it down. */
  owner: string;
}

export type ZolikyPhase = 'playing' | 'roundEnd' | 'finished';
/** `draw` = the player takes a card first, `play` = lays down and finally discards. */
export type TurnStep = 'draw' | 'play';

export type ZolikyEvent =
  | { seq: number; type: 'deal'; round: number }
  | { seq: number; type: 'drawStock'; playerId: string }
  | { seq: number; type: 'takeDiscard'; playerId: string; cardId: FrenchCardId }
  | { seq: number; type: 'meld'; playerId: string; meldIds: string[]; opening: boolean }
  | { seq: number; type: 'layOff'; playerId: string; meldId: string; cardIds: FrenchCardId[] }
  | { seq: number; type: 'swapJoker'; playerId: string; meldId: string; cardIds: FrenchCardId[] }
  | { seq: number; type: 'discard'; playerId: string; cardId: FrenchCardId }
  | { seq: number; type: 'restock' }
  | { seq: number; type: 'close'; playerId: string; fromHand: boolean; points: Record<string, number> };

/** The state at the start of the play step, so a child can take the turn back. */
interface TurnSnapshot {
  hand: FrenchCardId[];
  melds: TableMeld[];
  opened: boolean;
  meldSeq: number;
}

export interface ZolikyGameState {
  game: 'zoliky-hra';
  version: number;
  id: string;
  createdAt: string;
  nightId: string | null;
  seed: number;
  settings: ZolikyGameSettings;
  players: TablePlayer[];
  phase: ZolikyPhase;
  roundIndex: number;
  dealer: number;
  hands: Record<string, FrenchCardId[]>;
  /** Face-down stock, last = top. */
  stock: FrenchCardId[];
  /** Discard pile, last = top (face up). */
  discard: FrenchCardId[];
  melds: TableMeld[];
  meldSeq: number;
  /** Has laid down the first combinations this round. */
  opened: Record<string, boolean>;
  turn: string;
  step: TurnStep;
  /** Card taken from the discard pile this turn (it may not go straight back). */
  tookDiscard: FrenchCardId | null;
  /** The player had laid down before this turn (for closing from hand). */
  openedBefore: boolean;
  snapshot: TurnSnapshot | null;
  /** Public: every card discarded this round, in order, and who took which from the pile. */
  discarded: { playerId: string; cardId: FrenchCardId }[];
  taken: { playerId: string; cardId: FrenchCardId }[];
  turnCount: number;
  restocks: number;
  seq: number;
  log: ZolikyEvent[];
  /** Score sheet of src/lib/cards/zoliky.ts. */
  sheet: ZolikyState;
  /** Points of the last finished round (for the round summary). */
  lastRound: { winnerId: string; fromHand: boolean; points: Record<string, number>; hands: Record<string, FrenchCardId[]> } | null;
  updatedAt: number;
}

export type ZolikyCommand =
  | { type: 'drawStock' }
  | { type: 'takeDiscard' }
  | { type: 'meld'; melds: string[][] }
  | { type: 'layOff'; meldId: string; cardIds: string[] }
  | { type: 'swapJoker'; meldId: string; cardIds: string[] }
  | { type: 'discard'; cardId: string }
  | { type: 'resetTurn' }
  | { type: 'nextRound' };

export type ZolikyAction = ZolikyCommand & { by: Actor; now: number };

export type ZolikyError =
  | 'forbidden'
  | 'wrongPhase'
  | 'notYourTurn'
  | 'drawFirst'
  | 'alreadyDrew'
  | 'emptyDiscard'
  | 'notInHand'
  | 'notOpened'
  | 'opening'
  | 'badMeld'
  | 'unknownMeld'
  | 'keepDiscard'
  | 'sameDiscard'
  | 'mustUseDiscard'
  | 'nothingToReset';

export type ZolikyResult =
  | { ok: true; state: ZolikyGameState }
  | { ok: false; error: ZolikyError; state: ZolikyGameState; detail?: string };

// ---------------------------------------------------------------------------------------------

export function createZolikyGame(input: {
  id: string;
  createdAt: string;
  seed: number;
  players: TablePlayer[];
  nightId?: string | null;
  settings?: Partial<ZolikyGameSettings>;
  now?: number;
}): ZolikyGameState {
  const n = input.players.length;
  if (n < ZOLIKY_MIN_PLAYERS || n > ZOLIKY_MAX_PLAYERS) {
    throw new Error(`[zoliky] ${n} players, allowed ${ZOLIKY_MIN_PLAYERS}–${ZOLIKY_MAX_PLAYERS}`);
  }
  const settings: ZolikyGameSettings = {
    ...DEFAULT_ZOLIKY_GAME_SETTINGS,
    ...input.settings,
    values: { ...DEFAULT_ZOLIKY_GAME_SETTINGS.values, ...input.settings?.values },
  };
  if (handSizeFor(settings, n) * n + 1 > 100) throw new Error('[zoliky] hand size too large for the deck');
  const sheet = createZoliky({
    id: input.id,
    createdAt: input.createdAt,
    nightId: input.nightId ?? null,
    players: input.players.map(({ id, name, memberIds }) => ({ id, name, ...(memberIds ? { memberIds } : {}) })),
    settings: { maxRounds: settings.rounds, winnerScore: 0, lowerIsBetter: true, closeFromHand: { winnerBonus: 0, othersMultiplier: settings.fromHandMultiplier } },
  });
  const base: ZolikyGameState = {
    game: 'zoliky-hra',
    version: ZOLIKY_GAME_VERSION,
    id: input.id,
    createdAt: input.createdAt,
    nightId: input.nightId ?? null,
    seed: input.seed >>> 0,
    settings,
    players: input.players.map((p) => ({ ...p })),
    phase: 'playing',
    roundIndex: 0,
    dealer: n - 1,
    hands: {},
    stock: [],
    discard: [],
    melds: [],
    meldSeq: 0,
    opened: {},
    turn: input.players[0].id,
    step: 'play',
    tookDiscard: null,
    openedBefore: false,
    snapshot: null,
    discarded: [],
    taken: [],
    turnCount: 0,
    restocks: 0,
    seq: 0,
    log: [],
    sheet,
    lastRound: null,
    updatedAt: input.now ?? 0,
  };
  return dealRound(base, 0, base.dealer);
}

function pushLog(state: ZolikyGameState, event: NoSeq<ZolikyEvent>): ZolikyGameState {
  const seq = state.seq + 1;
  return { ...state, seq, log: [...state.log, { ...event, seq } as ZolikyEvent].slice(-LOG_LIMIT) };
}

function snapshotOf(state: ZolikyGameState, playerId: string): TurnSnapshot {
  return { hand: [...state.hands[playerId]], melds: state.melds, opened: !!state.opened[playerId], meldSeq: state.meldSeq };
}

function dealRound(state: ZolikyGameState, roundIndex: number, dealer: number): ZolikyGameState {
  const n = state.players.length;
  const deck = shuffleDeck(zolikyDeck(), nextSeed(state.seed, roundIndex * 1000));
  const size = handSizeFor(state.settings, n);
  const hands: Record<string, FrenchCardId[]> = {};
  for (const p of state.players) hands[p.id] = [];
  for (let r = 0; r < size; r++) for (let i = 1; i <= n; i++) hands[state.players[(dealer + i) % n].id].push(deck.pop()!);
  const starter = state.players[(dealer + 1) % n].id;
  hands[starter].push(deck.pop()!);
  let next: ZolikyGameState = {
    ...state,
    phase: 'playing',
    roundIndex,
    dealer,
    hands,
    stock: deck,
    discard: [],
    melds: [],
    meldSeq: 0,
    opened: Object.fromEntries(state.players.map((p) => [p.id, false])),
    turn: starter,
    // The starter holds one card more and begins by discarding.
    step: 'play',
    tookDiscard: null,
    openedBefore: false,
    snapshot: null,
    discarded: [],
    taken: [],
    turnCount: 0,
    restocks: 0,
  };
  next = { ...next, snapshot: snapshotOf(next, starter) };
  return pushLog(next, { type: 'deal', round: roundIndex });
}

// ---------------------------------------------------------------------------------------------
// Queries

export function topDiscard(state: ZolikyGameState): FrenchCardId | null {
  return state.discard.length ? state.discard[state.discard.length - 1] : null;
}

export function playerName(state: ZolikyGameState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? id;
}

function nextPlayer(state: ZolikyGameState, id: string): string {
  const i = state.players.findIndex((p) => p.id === id);
  return state.players[(i + 1) % state.players.length].id;
}

/** May the player take the top of the discard pile now (before laying down: only to lay down with it)? */
export function canTakeDiscard(state: ZolikyGameState, playerId: string): boolean {
  return state.phase === 'playing' && state.turn === playerId && state.step === 'draw' && state.discard.length > 0;
}

export function meldShape(state: ZolikyGameState, meldId: string): TableMeld | undefined {
  return state.melds.find((m) => m.id === meldId);
}

/** Current totals from the score sheet (playerId → points). */
export function totals(state: ZolikyGameState): Record<string, number> {
  return zolikySheet(state.sheet).totals;
}

// ---------------------------------------------------------------------------------------------
// Reducer

function fail(state: ZolikyGameState, error: ZolikyError, detail?: string): ZolikyResult {
  return { ok: false, error, state, ...(detail ? { detail } : {}) };
}

function inHand(hand: readonly string[], ids: readonly string[]): boolean {
  const left = hand.slice();
  for (const id of ids) {
    const i = left.indexOf(id);
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

function without(hand: readonly string[], ids: readonly string[]): FrenchCardId[] {
  const drop = new Set(ids);
  return hand.filter((id) => !drop.has(id));
}

function drawFromStock(state: ZolikyGameState): { state: ZolikyGameState; card: FrenchCardId | null } {
  let s = state;
  if (s.stock.length === 0) {
    if (s.discard.length <= 1) return { state: s, card: null };
    // The discard pile is turned over (all but its top card) and becomes the new stock.
    const top = s.discard[s.discard.length - 1];
    const rest = s.discard.slice(0, -1).reverse();
    s = pushLog({ ...s, stock: rest, discard: [top], restocks: s.restocks + 1 }, { type: 'restock' });
  }
  const stock = s.stock.slice();
  const card = stock.pop()!;
  return { state: { ...s, stock }, card };
}

function closeRound(state: ZolikyGameState, winnerId: string, fromHand: boolean): ZolikyGameState {
  const values = state.settings.values;
  const hand: Record<string, number> = {};
  for (const p of state.players) if (p.id !== winnerId) hand[p.id] = handPoints(state.hands[p.id], values);
  const sheet = reduceZoliky(state.sheet, { type: 'addRound', winnerId, hand, fromHand });
  const points: Record<string, number> = {};
  const mult = fromHand ? state.settings.fromHandMultiplier : 1;
  for (const p of state.players) points[p.id] = p.id === winnerId ? 0 : hand[p.id] * mult;
  let next: ZolikyGameState = {
    ...state,
    sheet,
    lastRound: { winnerId, fromHand, points, hands: Object.fromEntries(state.players.map((p) => [p.id, [...state.hands[p.id]]])) },
    snapshot: null,
  };
  next = pushLog(next, { type: 'close', playerId: winnerId, fromHand, points });
  const finished = zolikySheet(sheet).finished;
  return { ...next, phase: finished ? 'finished' : 'roundEnd' };
}

function endTurn(state: ZolikyGameState, playerId: string): ZolikyGameState {
  let s: ZolikyGameState = { ...state, turnCount: state.turnCount + 1 };
  if (s.turnCount >= ZOLIKY_TURN_LIMIT) {
    const values = s.settings.values;
    const winner = s.players
      .map((p) => p.id)
      .sort((a, b) => handPoints(s.hands[a], values) - handPoints(s.hands[b], values))[0];
    return closeRound(s, winner, false);
  }
  const next = nextPlayer(s, playerId);
  s = { ...s, turn: next, step: 'draw', tookDiscard: null, openedBefore: !!s.opened[next], snapshot: null };
  return s;
}

function startPlay(state: ZolikyGameState, playerId: string): ZolikyGameState {
  const s = { ...state, step: 'play' as const, openedBefore: !!state.opened[playerId] };
  return { ...s, snapshot: snapshotOf(s, playerId) };
}

export function applyZoliky(state: ZolikyGameState, action: ZolikyAction): ZolikyResult {
  const { by, now } = action;
  if (by.role === 'system') return fail(state, 'forbidden');
  const me = by.role === 'contestant' ? by.contestantId : null;
  if (me !== null && !state.players.some((p) => p.id === me)) return fail(state, 'forbidden');

  if (action.type === 'nextRound') {
    if (state.phase !== 'roundEnd') return fail(state, 'wrongPhase');
    const dealer = (state.dealer + 1) % state.players.length;
    return { ok: true, state: { ...dealRound(state, state.roundIndex + 1, dealer), updatedAt: now } };
  }
  if (me === null) return fail(state, 'forbidden');
  if (state.phase !== 'playing') return fail(state, 'wrongPhase');
  if (state.turn !== me) return fail(state, 'notYourTurn');
  const hand = state.hands[me];

  switch (action.type) {
    case 'drawStock': {
      if (state.step !== 'draw') return fail(state, 'alreadyDrew');
      const drawn = drawFromStock(state);
      let s = drawn.state;
      if (drawn.card) s = { ...s, hands: { ...s.hands, [me]: [...hand, drawn.card] } };
      s = pushLog({ ...s, updatedAt: now }, { type: 'drawStock', playerId: me });
      return { ok: true, state: startPlay(s, me) };
    }
    case 'takeDiscard': {
      if (state.step !== 'draw') return fail(state, 'alreadyDrew');
      const card = topDiscard(state);
      if (!card) return fail(state, 'emptyDiscard');
      let s: ZolikyGameState = {
        ...state,
        discard: state.discard.slice(0, -1),
        hands: { ...state.hands, [me]: [...hand, card] },
        tookDiscard: card,
        taken: [...state.taken, { playerId: me, cardId: card }],
        updatedAt: now,
      };
      s = pushLog(s, { type: 'takeDiscard', playerId: me, cardId: card });
      return { ok: true, state: startPlay(s, me) };
    }
    case 'meld': {
      if (state.step !== 'play') return fail(state, 'drawFirst');
      const melds = action.melds ?? [];
      const all = melds.flat();
      if (!inHand(hand, all)) return fail(state, 'notInHand');
      if (all.length >= hand.length) return fail(state, 'keepDiscard');
      const opening = !state.opened[me];
      const shapes: MeldShape[] = [];
      if (opening) {
        const check = checkOpening(melds, { min: state.settings.openingMin, requirePureRun: state.settings.requirePureRun, values: state.settings.values });
        if (!check.ok) return fail(state, 'opening', check.reason ?? undefined);
        for (const m of check.melds) if (m.ok) shapes.push(m.shape);
      } else {
        if (melds.length === 0) return fail(state, 'badMeld', 'Vyber aspoň jednu skupinu karet.');
        for (const m of melds) {
          const check = analyzeMeld(m);
          if (!check.ok) return fail(state, 'badMeld', MELD_ERROR_TEXT[check.error]);
          shapes.push(check.shape);
        }
      }
      let seq = state.meldSeq;
      const added: TableMeld[] = shapes.map((shape) => ({ ...shape, id: `m${++seq}`, owner: me }));
      let s: ZolikyGameState = {
        ...state,
        hands: { ...state.hands, [me]: without(hand, all) },
        melds: [...state.melds, ...added],
        meldSeq: seq,
        opened: { ...state.opened, [me]: true },
        updatedAt: now,
      };
      s = pushLog(s, { type: 'meld', playerId: me, meldIds: added.map((m) => m.id), opening });
      return { ok: true, state: s };
    }
    case 'layOff':
    case 'swapJoker': {
      if (state.step !== 'play') return fail(state, 'drawFirst');
      if (!state.opened[me]) return fail(state, 'notOpened');
      const target = meldShape(state, action.meldId);
      if (!target) return fail(state, 'unknownMeld');
      const ids = action.cardIds ?? [];
      if (!inHand(hand, ids)) return fail(state, 'notInHand');
      let newShape: MeldShape;
      let back: FrenchCardId[] = [];
      if (action.type === 'layOff') {
        if (ids.length >= hand.length) return fail(state, 'keepDiscard');
        const r = layOff(target, ids);
        if (!r.ok) return fail(state, 'badMeld', MELD_ERROR_TEXT[r.error]);
        newShape = r.shape;
      } else {
        const r = swapJoker(target, ids);
        if (!r.ok) return fail(state, 'badMeld', MELD_ERROR_TEXT[r.error]);
        newShape = r.shape;
        back = r.freed;
      }
      const melds = state.melds.map((m) => (m.id === target.id ? { ...m, kind: newShape.kind, slots: newShape.slots } : m));
      let s: ZolikyGameState = { ...state, melds, hands: { ...state.hands, [me]: [...without(hand, ids), ...back] }, updatedAt: now };
      s = pushLog(s, { type: action.type, playerId: me, meldId: target.id, cardIds: ids });
      return { ok: true, state: s };
    }
    case 'discard': {
      if (state.step !== 'play') return fail(state, 'drawFirst');
      if (!hand.includes(action.cardId)) return fail(state, 'notInHand');
      if (state.tookDiscard) {
        if (action.cardId === state.tookDiscard && hand.length > 1) return fail(state, 'sameDiscard');
        if (!state.openedBefore && (!state.opened[me] || hand.includes(state.tookDiscard))) return fail(state, 'mustUseDiscard');
      }
      const rest = hand.filter((id) => id !== action.cardId);
      let s: ZolikyGameState = {
        ...state,
        hands: { ...state.hands, [me]: rest },
        discard: [...state.discard, action.cardId],
        discarded: [...state.discarded, { playerId: me, cardId: action.cardId }],
        updatedAt: now,
      };
      s = pushLog(s, { type: 'discard', playerId: me, cardId: action.cardId });
      if (rest.length === 0) return { ok: true, state: closeRound(s, me, !state.openedBefore) };
      return { ok: true, state: endTurn(s, me) };
    }
    case 'resetTurn': {
      if (state.step !== 'play' || !state.snapshot) return fail(state, 'nothingToReset');
      const snap = state.snapshot;
      return {
        ok: true,
        state: {
          ...state,
          hands: { ...state.hands, [me]: [...snap.hand] },
          melds: snap.melds,
          meldSeq: snap.meldSeq,
          opened: { ...state.opened, [me]: snap.opened },
          updatedAt: now,
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Explanations

export function errorText(error: ZolikyError, detail?: string): string {
  if (detail) return detail;
  switch (error) {
    case 'forbidden':
      return 'Tohle teď udělat nemůžeš.';
    case 'wrongPhase':
      return 'Kolo už skončilo.';
    case 'notYourTurn':
      return 'Počkej, teď hraje někdo jiný.';
    case 'drawFirst':
      return 'Nejdřív si vezmi kartu z balíčku nebo z odhozených.';
    case 'alreadyDrew':
      return 'Kartu už sis vzal. Teď vykládej, nebo jednu kartu odhoď.';
    case 'emptyDiscard':
      return 'Odhazovací hromádka je prázdná.';
    case 'notInHand':
      return 'Tyhle karty nemáš v ruce.';
    case 'notOpened':
      return 'Přikládat a měnit žolíky můžeš, až když sám poprvé vyložíš.';
    case 'opening':
      return 'Na první vyložení to ještě nestačí.';
    case 'badMeld':
      return 'Tahle skupina karet neplatí.';
    case 'unknownMeld':
      return 'Tahle skupina na stole není.';
    case 'keepDiscard':
      return 'Jednu kartu si musíš nechat na odhození — tou se zavírá.';
    case 'sameDiscard':
      return 'Kartu, kterou sis vzal z odhozených, nemůžeš hned zase odhodit.';
    case 'mustUseDiscard':
      return 'Kartu z odhozených sis vzal, tak ji musíš hned vyložit (a vyložit poprvé aspoň 42 bodů).';
    case 'nothingToReset':
      return 'Není co vracet.';
  }
}

export function cardName(id: string): string {
  return frenchCardName(id);
}

// ---------------------------------------------------------------------------------------------
// Views and results

export type ZolikyViewer = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'spectator' };

export interface ZolikyView {
  game: 'zoliky-hra';
  id: string;
  phase: ZolikyPhase;
  settings: ZolikyGameSettings;
  roundIndex: number;
  players: { id: string; name: string; ai: AiLevel | null; cards: number; opened: boolean; total: number }[];
  hand: FrenchCardId[] | null;
  stockCount: number;
  topDiscard: FrenchCardId | null;
  discardCount: number;
  melds: TableMeld[];
  turn: string;
  step: TurnStep;
  tookDiscard: FrenchCardId | null;
  canReset: boolean;
  log: ZolikyEvent[];
  /** Score sheet rows: per round playerId → points and running totals. */
  rows: { scores: Record<string, number>; totals: Record<string, number> }[];
  lastRound: { winnerId: string; fromHand: boolean; points: Record<string, number> } | null;
}

/** What one screen may see: own hand only, the others as card counts; combinations are public. */
/** Something was laid down, laid off or swapped since the turn's snapshot: „Vrátit tah“ has work to do. */
function changedThisTurn(state: ZolikyGameState, playerId: string): boolean {
  const snap = state.snapshot;
  if (!snap) return false;
  const hand = state.hands[playerId] ?? [];
  if (state.meldSeq !== snap.meldSeq || hand.length !== snap.hand.length || state.melds.length !== snap.melds.length) return true;
  if (hand.some((c, i) => c !== snap.hand[i])) return true;
  // By value, not by reference: the state comes back from localStorage, the wire or a Svelte proxy.
  return JSON.stringify(state.melds) !== JSON.stringify(snap.melds);
}

export function viewFor(state: ZolikyGameState, viewer: ZolikyViewer): ZolikyView {
  const me = viewer.role === 'contestant' ? viewer.contestantId : null;
  const sheet = zolikySheet(state.sheet);
  return {
    game: 'zoliky-hra',
    id: state.id,
    phase: state.phase,
    settings: state.settings,
    roundIndex: state.roundIndex,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      ai: p.ai ?? null,
      cards: (state.hands[p.id] ?? []).length,
      opened: !!state.opened[p.id],
      total: sheet.totals[p.id] ?? 0,
    })),
    hand: me && state.hands[me] ? [...state.hands[me]] : null,
    stockCount: state.stock.length,
    topDiscard: topDiscard(state),
    discardCount: state.discard.length,
    melds: state.melds,
    turn: state.turn,
    step: state.step,
    tookDiscard: me === state.turn ? state.tookDiscard : null,
    canReset: me === state.turn && state.step === 'play' && changedThisTurn(state, me),
    log: state.log,
    rows: sheet.rows,
    lastRound: state.lastRound ? { winnerId: state.lastRound.winnerId, fromHand: state.lastRound.fromHand, points: state.lastRound.points } : null,
  };
}

export function isFinished(state: ZolikyGameState): boolean {
  return state.phase === 'finished';
}

/** League result (gameType 'zoliky') from the score sheet. */
export function toMatchResult(state: ZolikyGameState, playedAt: string = state.createdAt): MatchResult {
  return zolikyToMatchResult(state.sheet, playedAt);
}

export type { MeldError };
