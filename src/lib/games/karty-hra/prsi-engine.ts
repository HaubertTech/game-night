// Prší with real cards in the browser (or later in a live room) as a pure reducer.
//
// Czech rules (README.md, with sources): 32 German-suited cards, 4 cards each, one card turned
// up. Play a card of the same suit or the same rank. A seven makes the next player draw two
// cards unless they answer with a seven (the penalty adds up: 2, 4, 6, 8). An ace makes the next
// player stand unless they answer with an ace. A svršek (Ober) changes the suit and may be played
// on anything except an active seven or ace. Whoever has no card to play draws one and the turn
// passes. The first player out wins, the others play on for the order; the last one loses.
//
// State is plain JSON. Time and the actor come with every action (`by`, `now`), like the other
// games, so the same reducer can run on the server. The deal order is recorded on the score
// sheet of src/lib/cards/prsi.ts, so the league result is the same as for physical cards.

import { createPrsi, prsiToMatchResult, reducePrsi, type CardPlayer, type PrsiState } from '../../cards/prsi.ts';
import type { MatchResult } from '../../league/types.ts';
import {
  MARIAS_SUIT_LABELS,
  MARIAS_SUITS,
  mariasCard,
  mariasCardName,
  mariasDeck,
  nextSeed,
  shuffleDeck,
  type MariasCardId,
  type MariasRank,
  type MariasSuit,
} from './cards.ts';

export const PRSI_GAME_VERSION = 1;
export const PRSI_MIN_PLAYERS = 2;
export const PRSI_MAX_PLAYERS = 5;
/** Safety stop: a deal that runs this long ends by the number of cards in hand. */
export const PRSI_TURN_LIMIT = 600;
type NoSeq<T> = T extends unknown ? Omit<T, 'seq'> : never;
const LOG_LIMIT = 40;

export interface PrsiSettings {
  /** Cards dealt to each player. */
  handSize: number;
  /** Deals (partie) in one game; the score sheet sums the places. */
  deals: number;
  /** Cards drawn per seven. */
  drawPerSeven: number;
  /** A svršek may be played on a svršek. */
  oberOnOber: boolean;
  /** A seven or ace turned up at the start counts against the first player. */
  firstCardActive: boolean;
}

export const DEFAULT_PRSI_SETTINGS: PrsiSettings = {
  handSize: 4,
  deals: 1,
  drawPerSeven: 2,
  oberOnOber: true,
  firstCardActive: true,
};

export type AiLevel = 1 | 2 | 3;

export interface TablePlayer extends CardPlayer {
  /** Played by the computer (the UI or the server runs the AI for this seat). */
  ai?: AiLevel | null;
}

export type PrsiPhase = 'playing' | 'dealEnd' | 'finished';

export type PrsiEvent =
  | { seq: number; type: 'deal'; dealIndex: number; top: MariasCardId }
  | { seq: number; type: 'play'; playerId: string; cardId: MariasCardId; suit: MariasSuit | null }
  | { seq: number; type: 'draw'; playerId: string; count: number; penalty: boolean }
  | { seq: number; type: 'stand'; playerId: string }
  | { seq: number; type: 'out'; playerId: string; place: number }
  | { seq: number; type: 'reshuffle' }
  | { seq: number; type: 'dealEnd'; order: string[] };

export interface PrsiGameState {
  game: 'prsi-hra';
  version: number;
  id: string;
  createdAt: string;
  nightId: string | null;
  seed: number;
  settings: PrsiSettings;
  players: TablePlayer[];
  phase: PrsiPhase;
  dealIndex: number;
  /** Index of the dealer; the player after the dealer starts. */
  dealer: number;
  hands: Record<string, MariasCardId[]>;
  /** Face-down draw pile, last element = top. */
  stock: MariasCardId[];
  /** Discard pile, last element = the card on top. */
  discard: MariasCardId[];
  /** Suit the next card must follow (the top card's suit, or the one a svršek asked for). */
  suit: MariasSuit;
  /** Sevens waiting for the next player (0 = none). */
  pendingSevens: number;
  /** An ace waits for the next player. */
  pendingAce: boolean;
  turn: string;
  /** Players out in this deal, in order. */
  out: string[];
  /** Public knowledge: suits a player could not follow (drew instead) since they last played them. */
  lacking: Record<string, MariasSuit[]>;
  turnCount: number;
  reshuffles: number;
  seq: number;
  log: PrsiEvent[];
  /** Score sheet of src/lib/cards/prsi.ts with the order of every finished deal. */
  sheet: PrsiState;
  updatedAt: number;
}

export type Actor = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'system' };

export type PrsiCommand =
  | { type: 'play'; cardId: string; suit?: MariasSuit }
  | { type: 'draw' }
  | { type: 'stand' }
  | { type: 'nextDeal' };

export type PrsiAction = PrsiCommand & { by: Actor; now: number };

export type PrsiError =
  | 'forbidden'
  | 'wrongPhase'
  | 'notYourTurn'
  | 'notInHand'
  | 'mustAnswerSeven'
  | 'mustAnswerAce'
  | 'wrongCard'
  | 'needSuit'
  | 'oberOnOber'
  | 'mustStand'
  | 'nothingToStand';

export type PrsiResult = { ok: true; state: PrsiGameState } | { ok: false; error: PrsiError; state: PrsiGameState };

// ---------------------------------------------------------------------------------------------

export function createPrsiGame(input: {
  id: string;
  createdAt: string;
  seed: number;
  players: TablePlayer[];
  nightId?: string | null;
  settings?: Partial<PrsiSettings>;
  now?: number;
}): PrsiGameState {
  if (input.players.length < PRSI_MIN_PLAYERS || input.players.length > PRSI_MAX_PLAYERS) {
    throw new Error(`[prsi] ${input.players.length} players, allowed ${PRSI_MIN_PLAYERS}–${PRSI_MAX_PLAYERS}`);
  }
  const settings = { ...DEFAULT_PRSI_SETTINGS, ...input.settings };
  if (settings.handSize * input.players.length > 28) throw new Error('[prsi] hand size too large for the deck');
  const sheet = createPrsi({
    id: input.id,
    createdAt: input.createdAt,
    nightId: input.nightId ?? null,
    players: input.players.map(({ id, name, memberIds }) => ({ id, name, ...(memberIds ? { memberIds } : {}) })),
  });
  const base: PrsiGameState = {
    game: 'prsi-hra',
    version: PRSI_GAME_VERSION,
    id: input.id,
    createdAt: input.createdAt,
    nightId: input.nightId ?? null,
    seed: input.seed >>> 0,
    settings,
    players: input.players.map((p) => ({ ...p })),
    phase: 'playing',
    dealIndex: 0,
    dealer: input.players.length - 1,
    hands: {},
    stock: [],
    discard: [],
    suit: 'srdce',
    pendingSevens: 0,
    pendingAce: false,
    turn: input.players[0].id,
    out: [],
    lacking: {},
    turnCount: 0,
    reshuffles: 0,
    seq: 0,
    log: [],
    sheet,
    updatedAt: input.now ?? 0,
  };
  return deal(base, 0, base.dealer);
}

function pushLog(state: PrsiGameState, event: NoSeq<PrsiEvent>): PrsiGameState {
  const seq = state.seq + 1;
  const log = [...state.log, { ...event, seq } as PrsiEvent].slice(-LOG_LIMIT);
  return { ...state, seq, log };
}

function deal(state: PrsiGameState, dealIndex: number, dealer: number): PrsiGameState {
  const deck = shuffleDeck(mariasDeck(), nextSeed(state.seed, dealIndex * 1000));
  const n = state.players.length;
  const hands: Record<string, MariasCardId[]> = {};
  for (const p of state.players) hands[p.id] = [];
  // One card at a time, starting left of the dealer, as at the table.
  for (let r = 0; r < state.settings.handSize; r++) {
    for (let i = 1; i <= n; i++) hands[state.players[(dealer + i) % n].id].push(deck.pop()!);
  }
  const top = deck.pop()!;
  const topCard = mariasCard(top);
  const first = state.players[(dealer + 1) % n].id;
  let next: PrsiGameState = {
    ...state,
    phase: 'playing',
    dealIndex,
    dealer,
    hands,
    stock: deck,
    discard: [top],
    suit: topCard.suit,
    pendingSevens: state.settings.firstCardActive && topCard.rank === '7' ? 1 : 0,
    pendingAce: state.settings.firstCardActive && topCard.rank === 'eso',
    turn: first,
    out: [],
    lacking: {},
    turnCount: 0,
    reshuffles: 0,
  };
  next = pushLog(next, { type: 'deal', dealIndex, top });
  return next;
}

// ---------------------------------------------------------------------------------------------
// Queries

export function topCard(state: PrsiGameState): MariasCardId {
  return state.discard[state.discard.length - 1];
}

export function playerName(state: PrsiGameState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? id;
}

/** Players still holding cards in this deal, in seat order. */
export function activeIds(state: PrsiGameState): string[] {
  return state.players.filter((p) => !state.out.includes(p.id)).map((p) => p.id);
}

function nextActive(state: PrsiGameState, fromId: string): string {
  const n = state.players.length;
  const start = state.players.findIndex((p) => p.id === fromId);
  for (let i = 1; i <= n; i++) {
    const id = state.players[(start + i) % n].id;
    if (!state.out.includes(id)) return id;
  }
  return fromId;
}

/** Why `cardId` may not be played now by `playerId` (null = it may). */
export function playError(state: PrsiGameState, playerId: string, cardId: string): PrsiError | null {
  if (state.phase !== 'playing') return 'wrongPhase';
  if (state.turn !== playerId) return 'notYourTurn';
  const hand = state.hands[playerId] ?? [];
  if (!hand.includes(cardId as MariasCardId)) return 'notInHand';
  const card = mariasCard(cardId);
  const top = mariasCard(topCard(state));
  if (state.pendingSevens > 0) return card.rank === '7' ? null : 'mustAnswerSeven';
  if (state.pendingAce) return card.rank === 'eso' ? null : 'mustAnswerAce';
  if (card.rank === 'svrsek') return top.rank === 'svrsek' && !state.settings.oberOnOber ? 'oberOnOber' : null;
  if (card.suit === state.suit) return null;
  // Rank match only against a real top card; after a svršek the asked suit counts.
  if (card.rank === top.rank) return null;
  return 'wrongCard';
}

export function playableCards(state: PrsiGameState, playerId: string): MariasCardId[] {
  return (state.hands[playerId] ?? []).filter((c) => playError(state, playerId, c) === null);
}

/** What the player may do instead of playing a card now. */
export function fallbackMove(state: PrsiGameState): 'draw' | 'drawPenalty' | 'stand' {
  if (state.pendingAce) return 'stand';
  if (state.pendingSevens > 0) return 'drawPenalty';
  return 'draw';
}

export function penaltyCards(state: PrsiGameState): number {
  return state.pendingSevens * state.settings.drawPerSeven;
}

// ---------------------------------------------------------------------------------------------
// Reducer

function fail(state: PrsiGameState, error: PrsiError): PrsiResult {
  return { ok: false, error, state };
}

function actorId(by: Actor): string | null {
  return by.role === 'contestant' ? by.contestantId : null;
}

function drawCards(state: PrsiGameState, count: number): { state: PrsiGameState; cards: MariasCardId[] } {
  let s = state;
  const cards: MariasCardId[] = [];
  for (let i = 0; i < count; i++) {
    if (s.stock.length === 0) {
      if (s.discard.length <= 1) break;
      const top = s.discard[s.discard.length - 1];
      const rest = shuffleDeck(s.discard.slice(0, -1), nextSeed(s.seed, s.dealIndex * 1000 + s.reshuffles + 1));
      s = pushLog({ ...s, stock: rest, discard: [top], reshuffles: s.reshuffles + 1 }, { type: 'reshuffle' });
    }
    const stock = s.stock.slice();
    cards.push(stock.pop()!);
    s = { ...s, stock };
  }
  return { state: s, cards };
}

function endDeal(state: PrsiGameState, order: string[]): PrsiGameState {
  const sheet = reducePrsi(state.sheet, { type: 'record', order });
  let next: PrsiGameState = pushLog({ ...state, sheet, out: order.slice(0, -1) }, { type: 'dealEnd', order });
  if (sheet.deals.length >= state.settings.deals) {
    next = { ...next, phase: 'finished', sheet: reducePrsi(sheet, { type: 'finish' }) };
  } else {
    next = { ...next, phase: 'dealEnd' };
  }
  return next;
}

/** After a move: ends the deal when one player is left, otherwise passes the turn. */
function afterMove(state: PrsiGameState, moverId: string): PrsiGameState {
  let s: PrsiGameState = { ...state, turnCount: state.turnCount + 1 };
  if ((s.hands[moverId] ?? []).length === 0 && !s.out.includes(moverId)) {
    s = pushLog({ ...s, out: [...s.out, moverId] }, { type: 'out', playerId: moverId, place: s.out.length + 1 });
  }
  const left = activeIds(s);
  if (left.length <= 1) return endDeal(s, [...s.out, ...left]);
  if (s.turnCount >= PRSI_TURN_LIMIT) {
    const rest = left.slice().sort((a, b) => s.hands[a].length - s.hands[b].length);
    return endDeal(s, [...s.out, ...rest]);
  }
  return { ...s, turn: nextActive(s, moverId) };
}

export function applyPrsi(state: PrsiGameState, action: PrsiAction): PrsiResult {
  const { by, now } = action;
  if (by.role === 'system') return fail(state, 'forbidden');
  const me = actorId(by);
  if (me !== null && !state.players.some((p) => p.id === me)) return fail(state, 'forbidden');

  switch (action.type) {
    case 'play': {
      if (me === null) return fail(state, 'forbidden');
      const error = playError(state, me, action.cardId);
      if (error) return fail(state, error);
      const card = mariasCard(action.cardId);
      let suit: MariasSuit = card.suit;
      if (card.rank === 'svrsek') {
        if (!action.suit || !MARIAS_SUITS.includes(action.suit)) return fail(state, 'needSuit');
        suit = action.suit;
      }
      const hand = state.hands[me].filter((c) => c !== card.id);
      const lacking = { ...state.lacking, [me]: (state.lacking[me] ?? []).filter((s) => s !== card.suit) };
      let s: PrsiGameState = {
        ...state,
        hands: { ...state.hands, [me]: hand },
        discard: [...state.discard, card.id],
        suit,
        pendingSevens: card.rank === '7' ? state.pendingSevens + 1 : 0,
        pendingAce: card.rank === 'eso',
        lacking,
        updatedAt: now,
      };
      s = pushLog(s, { type: 'play', playerId: me, cardId: card.id, suit: card.rank === 'svrsek' ? suit : null });
      return { ok: true, state: afterMove(s, me) };
    }
    case 'draw': {
      if (me === null) return fail(state, 'forbidden');
      if (state.phase !== 'playing') return fail(state, 'wrongPhase');
      if (state.turn !== me) return fail(state, 'notYourTurn');
      if (state.pendingAce) return fail(state, 'mustStand');
      const penalty = state.pendingSevens > 0;
      const count = penalty ? penaltyCards(state) : 1;
      const drawn = drawCards(state, count);
      let s: PrsiGameState = {
        ...drawn.state,
        hands: { ...drawn.state.hands, [me]: [...state.hands[me], ...drawn.cards] },
        pendingSevens: 0,
        updatedAt: now,
      };
      if (!penalty) {
        const lack = new Set(state.lacking[me] ?? []);
        lack.add(state.suit);
        s = { ...s, lacking: { ...s.lacking, [me]: [...lack] } };
      }
      s = pushLog(s, { type: 'draw', playerId: me, count: drawn.cards.length, penalty });
      return { ok: true, state: afterMove(s, me) };
    }
    case 'stand': {
      if (me === null) return fail(state, 'forbidden');
      if (state.phase !== 'playing') return fail(state, 'wrongPhase');
      if (state.turn !== me) return fail(state, 'notYourTurn');
      if (!state.pendingAce) return fail(state, 'nothingToStand');
      const s = pushLog({ ...state, pendingAce: false, updatedAt: now }, { type: 'stand', playerId: me });
      return { ok: true, state: afterMove(s, me) };
    }
    case 'nextDeal': {
      if (state.phase !== 'dealEnd') return fail(state, 'wrongPhase');
      const dealer = (state.dealer + 1) % state.players.length;
      return { ok: true, state: { ...deal(state, state.dealIndex + 1, dealer), updatedAt: now } };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Explanations (Czech, for the UI and the learning mode)

export function errorText(error: PrsiError): string {
  switch (error) {
    case 'forbidden':
      return 'Tohle teď udělat nemůžeš.';
    case 'wrongPhase':
      return 'Teď se nehraje.';
    case 'notYourTurn':
      return 'Počkej, teď hraje někdo jiný.';
    case 'notInHand':
      return 'Tuhle kartu nemáš v ruce.';
    case 'mustAnswerSeven':
      return 'Leží sedma. Můžeš dát jen sedmu, jinak bereš karty.';
    case 'mustAnswerAce':
      return 'Leží eso. Můžeš dát jen eso, jinak stojíš.';
    case 'wrongCard':
      return 'Karta musí mít stejnou barvu nebo stejnou hodnotu jako karta nahoře.';
    case 'needSuit':
      return 'Se svrškem musíš vybrat barvu.';
    case 'oberOnOber':
      return 'Svršek na svrška se v téhle hře nedává.';
    case 'mustStand':
      return 'Na eso se nebere, jen se stojí.';
    case 'nothingToStand':
      return 'Stát se dá jen na eso.';
  }
}

/** One child-friendly sentence why the card may (or may not) be played now. */
export function explainCard(state: PrsiGameState, playerId: string, cardId: string): string {
  const error = playError(state, playerId, cardId);
  const name = mariasCardName(cardId);
  const top = mariasCard(topCard(state));
  if (error === null) {
    const card = mariasCard(cardId);
    if (state.pendingSevens > 0) return `${cap(name)} přebije sedmu — další bere ještě víc.`;
    if (state.pendingAce) return `${cap(name)} přebije eso — stát bude další.`;
    if (card.rank === 'svrsek') return `${cap(name)} jde vždycky a vybereš si barvu.`;
    if (card.suit === state.suit) return `${cap(name)} má stejnou barvu (${MARIAS_SUIT_LABELS[state.suit]}).`;
    return `${cap(name)} má stejnou hodnotu jako ${mariasCardName(top.id)}.`;
  }
  if (error === 'wrongCard') {
    const asked = top.rank === 'svrsek' ? `Svršek si přál ${MARIAS_SUIT_LABELS[state.suit]}` : `Nahoře je ${mariasCardName(top.id)}`;
    return `${asked}. ${cap(name)} nemá stejnou barvu ani hodnotu.`;
  }
  return errorText(error);
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function suitLabel(suit: MariasSuit): string {
  return MARIAS_SUIT_LABELS[suit];
}

export function rankOf(cardId: string): MariasRank {
  return mariasCard(cardId).rank;
}

// ---------------------------------------------------------------------------------------------
// Views and results

export type PrsiViewer = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'spectator' };

export interface PrsiView {
  game: 'prsi-hra';
  id: string;
  phase: PrsiPhase;
  settings: PrsiSettings;
  dealIndex: number;
  players: { id: string; name: string; ai: AiLevel | null; cards: number; place: number | null }[];
  /** Own cards (contestant viewer only). */
  hand: MariasCardId[] | null;
  /** Own cards that may be played now (empty when it is not the viewer's turn). */
  playable: MariasCardId[];
  top: MariasCardId;
  discardCount: number;
  stockCount: number;
  suit: MariasSuit;
  pendingSevens: number;
  pendingAce: boolean;
  turn: string;
  log: PrsiEvent[];
  /** Finishing orders of the deals played so far. */
  deals: string[][];
}

/** What one screen may see: own hand only, other hands as counts, the stock face down. */
export function viewFor(state: PrsiGameState, viewer: PrsiViewer): PrsiView {
  const me = viewer.role === 'contestant' ? viewer.contestantId : null;
  return {
    game: 'prsi-hra',
    id: state.id,
    phase: state.phase,
    settings: state.settings,
    dealIndex: state.dealIndex,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      ai: p.ai ?? null,
      cards: (state.hands[p.id] ?? []).length,
      place: state.out.includes(p.id) ? state.out.indexOf(p.id) + 1 : null,
    })),
    hand: me && state.hands[me] ? [...state.hands[me]] : null,
    playable: me ? playableCards(state, me) : [],
    top: topCard(state),
    discardCount: state.discard.length,
    stockCount: state.stock.length,
    suit: state.suit,
    pendingSevens: state.pendingSevens,
    pendingAce: state.pendingAce,
    turn: state.turn,
    log: state.log,
    deals: state.sheet.deals.map((d) => [...d.order]),
  };
}

export function isFinished(state: PrsiGameState): boolean {
  return state.phase === 'finished';
}

/** League result (gameType 'prsi'): the same as a physical game written on the sheet. */
export function toMatchResult(state: PrsiGameState, playedAt: string = state.createdAt): MatchResult {
  return prsiToMatchResult(state.sheet, playedAt);
}
