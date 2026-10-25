// Žolíky (Czech rummy) score sheet as a pure reducer, round by round.
//
// The sheet only records numbers; counting cards stays at the table. Rules covered:
// - The player who went out (zahrál / zavřel) scores `winnerScore` (0, or a negative premium
//   such as −10 when lower is better). Everyone else scores the card points left in hand
//   (house rules differ: 2–10 face value, J/Q/K 10, ace 10–15, joker in hand 25–50).
// - Going out from hand at once (zavření z ruky, nothing laid down before) is optional:
//   `closeFromHand.winnerBonus` is added to the winner, the others' points are multiplied by
//   `closeFromHand.othersMultiplier`. The doubled penalty is a common Czech house rule, not a
//   published standard — treat both defaults as adjustable.
// - `lowerIsBetter` (default true): penalty-counting variant, lowest total wins. Set false for
//   variants that count positive points (melds minus hand, entered as one net number) where the
//   highest total wins.
// - `limit` (optional, e.g. 500): lower-is-better — whoever goes over the limit is out
//   (`limitMode: 'eliminate'`, last one standing ranks by total) or ends the game for everyone
//   (`limitMode: 'endGame'`, default). Higher-is-better — first to reach the limit ends the game.
// - `maxRounds` (optional): game ends after that many rounds.
// Without limit and maxRounds the game ends with the `finish` action.

import type { MatchResult } from '../league/types.ts';
import type { CardPlayer } from './prsi.ts';

export type { CardPlayer } from './prsi.ts';

export const ZOLIKY_STATE_VERSION = 1;

export interface ZolikySettings {
  lowerIsBetter: boolean;
  limit: number | null;
  limitMode: 'endGame' | 'eliminate';
  maxRounds: number | null;
  winnerScore: number;
  closeFromHand: { winnerBonus: number; othersMultiplier: number };
}

export const DEFAULT_ZOLIKY_SETTINGS: ZolikySettings = {
  lowerIsBetter: true,
  limit: null,
  limitMode: 'endGame',
  maxRounds: null,
  winnerScore: 0,
  closeFromHand: { winnerBonus: 0, othersMultiplier: 2 },
};

/** Raw input of one round, as written on the sheet. */
export interface ZolikyRound {
  winnerId: string;
  fromHand: boolean;
  /** playerId → card points in hand, for every active player except the winner. */
  hand: Record<string, number>;
}

export interface ZolikyState {
  version: number;
  id: string;
  nightId: string | null;
  createdAt: string;
  players: CardPlayer[];
  settings: ZolikySettings;
  rounds: ZolikyRound[];
  /** Ended manually (the game can also end by limit / maxRounds, see `isFinished`). */
  closed: boolean;
  error: string | null;
}

export type ZolikyAction =
  | { type: 'addRound'; winnerId: string; hand: Record<string, number>; fromHand?: boolean }
  | { type: 'undo' }
  | { type: 'finish' }
  | { type: 'reopen' };

export function createZoliky(input: {
  id: string;
  createdAt: string;
  nightId?: string | null;
  players: CardPlayer[];
  settings?: Partial<ZolikySettings>;
}): ZolikyState {
  const s = input.settings ?? {};
  return {
    version: ZOLIKY_STATE_VERSION,
    id: input.id,
    nightId: input.nightId ?? null,
    createdAt: input.createdAt,
    players: input.players,
    settings: {
      ...DEFAULT_ZOLIKY_SETTINGS,
      ...s,
      closeFromHand: { ...DEFAULT_ZOLIKY_SETTINGS.closeFromHand, ...s.closeFromHand },
    },
    rounds: [],
    closed: false,
    error: null,
  };
}

/** Score of every player in one round (only players present in that round). */
export function roundScores(settings: ZolikySettings, round: ZolikyRound): Record<string, number> {
  const mult = round.fromHand ? settings.closeFromHand.othersMultiplier : 1;
  const scores: Record<string, number> = {};
  for (const [id, points] of Object.entries(round.hand)) {
    if (id !== round.winnerId) scores[id] = points * mult;
  }
  scores[round.winnerId] = settings.winnerScore + (round.fromHand ? settings.closeFromHand.winnerBonus : 0);
  return scores;
}

export interface ZolikySheet {
  /** Per round: playerId → round score and running total after the round. */
  rows: { scores: Record<string, number>; totals: Record<string, number> }[];
  totals: Record<string, number>;
  /** playerId → index of the round after which the player was out (eliminate mode). */
  eliminatedAfter: Record<string, number>;
  finished: boolean;
}

function overLimit(settings: ZolikySettings, total: number): boolean {
  if (settings.limit === null) return false;
  return settings.lowerIsBetter ? total > settings.limit : total >= settings.limit;
}

/** Replay the rounds: running totals, eliminations and the end of the game. */
export function zolikySheet(state: ZolikyState): ZolikySheet {
  const { settings } = state;
  const totals: Record<string, number> = Object.fromEntries(state.players.map((p) => [p.id, 0]));
  const eliminatedAfter: Record<string, number> = {};
  const rows: ZolikySheet['rows'] = [];
  let endedByRule = false;
  state.rounds.forEach((round, i) => {
    const scores = roundScores(settings, round);
    for (const [id, s] of Object.entries(scores)) totals[id] = (totals[id] ?? 0) + s;
    rows.push({ scores, totals: { ...totals } });
    const crossed = state.players.filter((p) => !(p.id in eliminatedAfter) && overLimit(settings, totals[p.id]));
    if (crossed.length) {
      if (settings.limitMode === 'eliminate' && settings.lowerIsBetter) {
        for (const p of crossed) eliminatedAfter[p.id] = i;
        if (state.players.length - Object.keys(eliminatedAfter).length <= 1) endedByRule = true;
      } else {
        endedByRule = true;
      }
    }
    if (settings.maxRounds !== null && i + 1 >= settings.maxRounds) endedByRule = true;
  });
  return { rows, totals, eliminatedAfter, finished: endedByRule || state.closed };
}

export function isFinished(state: ZolikyState): boolean {
  return zolikySheet(state).finished;
}

/** Players still playing (not eliminated). */
export function activePlayers(state: ZolikyState): CardPlayer[] {
  const { eliminatedAfter } = zolikySheet(state);
  return state.players.filter((p) => !(p.id in eliminatedAfter));
}

/** Errors of a round input for the current state (empty = valid). */
export function validateRound(state: ZolikyState, winnerId: string, hand: Record<string, number>): string[] {
  const errors: string[] = [];
  const active = activePlayers(state);
  const activeIds = new Set(active.map((p) => p.id));
  if (!activeIds.has(winnerId)) errors.push('Kdo zahrál, musí být hráč, který ještě hraje.');
  for (const p of active) {
    if (p.id === winnerId) continue;
    const v = hand[p.id];
    if (v === undefined) errors.push(`Chybí body: ${p.name}`);
    else if (!Number.isFinite(v)) errors.push(`Neplatné body: ${p.name}`);
    else if (state.settings.lowerIsBetter && v < 0) errors.push(`Body v ruce nemohou být záporné: ${p.name}`);
  }
  for (const id of Object.keys(hand)) {
    if (!activeIds.has(id)) errors.push(`Hráč v tomto kole nehraje: ${id}`);
  }
  return errors;
}

export function reduceZoliky(state: ZolikyState, action: ZolikyAction): ZolikyState {
  switch (action.type) {
    case 'addRound': {
      if (isFinished(state)) return { ...state, error: 'Hra je ukončená.' };
      const errors = validateRound(state, action.winnerId, action.hand);
      if (errors.length) return { ...state, error: errors.join(' ') };
      const hand = { ...action.hand };
      delete hand[action.winnerId];
      const round: ZolikyRound = { winnerId: action.winnerId, fromHand: action.fromHand ?? false, hand };
      return { ...state, rounds: [...state.rounds, round], error: null };
    }
    case 'undo':
      if (state.rounds.length === 0) return { ...state, error: 'Není co vrátit.' };
      return { ...state, rounds: state.rounds.slice(0, -1), closed: false, error: null };
    case 'finish':
      if (state.rounds.length === 0) return { ...state, error: 'Zapiš aspoň jedno kolo.' };
      return { ...state, closed: true, error: null };
    case 'reopen':
      return { ...state, closed: false, error: null };
  }
}

export interface ZolikyRank {
  playerId: string;
  total: number;
  /** Rounds won (went out). */
  wins: number;
  eliminated: boolean;
  place: number;
}

/**
 * Standings: active players first by total (per `lowerIsBetter`), then eliminated players,
 * later elimination ranking higher. In end-game mode everyone ranks by total. Equal = shared.
 */
export function zolikyRanking(state: ZolikyState): ZolikyRank[] {
  const sheet = zolikySheet(state);
  const sign = state.settings.lowerIsBetter ? 1 : -1;
  const rows: (ZolikyRank & { out: number })[] = state.players.map((p) => ({
    playerId: p.id,
    total: sheet.totals[p.id] ?? 0,
    wins: state.rounds.filter((r) => r.winnerId === p.id).length,
    eliminated: p.id in sheet.eliminatedAfter,
    out: sheet.eliminatedAfter[p.id] ?? Number.POSITIVE_INFINITY,
    place: 0,
  }));
  const cmp = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    (a.out === b.out ? 0 : b.out - a.out > 0 ? 1 : -1) || sign * (a.total - b.total);
  rows.sort(cmp);
  rows.forEach((r, i) => {
    r.place = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].place : i + 1;
  });
  return rows.map(({ out: _out, ...r }) => r);
}

/** League result; `score` is the final total. */
export function zolikyToMatchResult(state: ZolikyState, playedAt: string = state.createdAt): MatchResult {
  const players = new Map(state.players.map((p) => [p.id, p]));
  return {
    matchId: state.id,
    gameType: 'zoliky',
    playedAt,
    nightId: state.nightId,
    participants: zolikyRanking(state).map((r) => {
      const memberIds = players.get(r.playerId)?.memberIds ?? [r.playerId];
      return {
        participantId: r.playerId,
        kind: memberIds.length > 1 ? 'team' : 'player',
        memberIds,
        place: r.place,
        score: r.total,
      };
    }),
  };
}

export { zolikyToMatchResult as toMatchResult };
