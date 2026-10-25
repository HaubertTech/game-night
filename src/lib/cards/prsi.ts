// Prší score sheet as a pure reducer. One "game" (hra) is a series of deals (partie); each deal
// is written down as the finishing order: who got rid of their cards first is 1st, the one left
// holding cards is last. The game is won by the lowest sum of places (ties: more 1st places).
// State is plain JSON, safe to store and send over the wire.

import type { MatchResult } from '../league/types.ts';

export const PRSI_STATE_VERSION = 1;

export interface CardPlayer {
  id: string;
  name: string;
  /** Player profile ids behind the seat; omit for a single player. */
  memberIds?: string[];
}

export interface PrsiDeal {
  /** Player ids, first = got rid of cards first. */
  order: string[];
}

export interface PrsiState {
  version: number;
  id: string;
  nightId: string | null;
  createdAt: string;
  players: CardPlayer[];
  deals: PrsiDeal[];
  finished: boolean;
  /** Reason the last action was rejected (Czech, for the UI); null after a valid action. */
  error: string | null;
}

export type PrsiAction =
  | { type: 'record'; order: string[] }
  /** Correct the last deal (e.g. two players swapped). */
  | { type: 'replaceLast'; order: string[] }
  | { type: 'undo' }
  | { type: 'finish' }
  | { type: 'reopen' };

export function createPrsi(input: { id: string; createdAt: string; nightId?: string | null; players: CardPlayer[] }): PrsiState {
  return {
    version: PRSI_STATE_VERSION,
    id: input.id,
    nightId: input.nightId ?? null,
    createdAt: input.createdAt,
    players: input.players,
    deals: [],
    finished: false,
    error: null,
  };
}

/** Errors of a finishing order (empty = valid): every player exactly once, nobody else. */
export function validateOrder(players: CardPlayer[], order: string[]): string[] {
  const errors: string[] = [];
  const ids = new Set(players.map((p) => p.id));
  const seen = new Set<string>();
  for (const id of order) {
    if (!ids.has(id)) errors.push(`Neznámý hráč: ${id}`);
    else if (seen.has(id)) errors.push(`Hráč je v pořadí dvakrát: ${id}`);
    seen.add(id);
  }
  for (const p of players) if (!seen.has(p.id)) errors.push(`Chybí hráč: ${p.name}`);
  if (players.length < 2) errors.push('Prší hrají aspoň dva hráči.');
  return errors;
}

function withError(state: PrsiState, error: string): PrsiState {
  return { ...state, error };
}

export function reducePrsi(state: PrsiState, action: PrsiAction): PrsiState {
  switch (action.type) {
    case 'record':
    case 'replaceLast': {
      if (state.finished) return withError(state, 'Hra je ukončená.');
      if (action.type === 'replaceLast' && state.deals.length === 0) return withError(state, 'Není co opravit.');
      const errors = validateOrder(state.players, action.order);
      if (errors.length) return withError(state, errors.join(' '));
      const deal = { order: [...action.order] };
      const deals = action.type === 'record' ? [...state.deals, deal] : [...state.deals.slice(0, -1), deal];
      return { ...state, deals, error: null };
    }
    case 'undo':
      if (state.deals.length === 0) return withError(state, 'Není co vrátit.');
      return { ...state, deals: state.deals.slice(0, -1), finished: false, error: null };
    case 'finish':
      if (state.deals.length === 0) return withError(state, 'Zapiš aspoň jednu partii.');
      return { ...state, finished: true, error: null };
    case 'reopen':
      return { ...state, finished: false, error: null };
  }
}

export interface PrsiRow {
  playerId: string;
  /** Sum of places over all deals (lower is better). */
  placeSum: number;
  /** Deals won (1st place). */
  wins: number;
  /** Deals finished last. */
  losses: number;
  place: number;
}

/** Game summary: sorted by sum of places, then more wins; equal on both = shared place. */
export function prsiSummary(state: PrsiState): PrsiRow[] {
  const n = state.players.length;
  const rows = state.players.map((p) => ({ playerId: p.id, placeSum: 0, wins: 0, losses: 0, place: 0 }));
  const byId = new Map(rows.map((r) => [r.playerId, r]));
  for (const deal of state.deals) {
    deal.order.forEach((id, i) => {
      const r = byId.get(id);
      if (!r) return;
      r.placeSum += i + 1;
      if (i === 0) r.wins++;
      if (i === n - 1) r.losses++;
    });
  }
  const cmp = (a: PrsiRow, b: PrsiRow) => a.placeSum - b.placeSum || b.wins - a.wins;
  rows.sort(cmp);
  rows.forEach((r, i) => {
    r.place = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].place : i + 1;
  });
  return rows;
}

/** Winners of the game (more than one on a shared 1st place); empty before the first deal. */
export function prsiWinners(state: PrsiState): string[] {
  if (state.deals.length === 0) return [];
  return prsiSummary(state)
    .filter((r) => r.place === 1)
    .map((r) => r.playerId);
}

/** League result of the whole game; `score` is the sum of places. */
export function prsiToMatchResult(state: PrsiState, playedAt: string = state.createdAt): MatchResult {
  const players = new Map(state.players.map((p) => [p.id, p]));
  return {
    matchId: state.id,
    gameType: 'prsi',
    playedAt,
    nightId: state.nightId,
    participants: prsiSummary(state).map((r) => {
      const memberIds = players.get(r.playerId)?.memberIds ?? [r.playerId];
      return {
        participantId: r.playerId,
        kind: memberIds.length > 1 ? 'team' : 'player',
        memberIds,
        place: r.place,
        score: r.placeSum,
      };
    }),
  };
}

export { prsiToMatchResult as toMatchResult };
