// Season table, best player of an evening and per-game-type tables.

import { DEFAULT_POINTS_TABLE, matchLeaguePoints } from './points.ts';
import { GAME_TYPES, type GameType, type MatchResult, type PointsTable } from './types.ts';

export interface StandingRow {
  playerId: string;
  points: number;
  matches: number;
  wins: number;
  /** League points per match, rounded to 2 decimals. */
  average: number;
  /** League points in the latest evening of the input (tie-break). */
  lastNightPoints: number;
  /** 1-based; equal only when points, wins and last-night points are all equal. */
  place: number;
}

export interface StandingsOptions {
  table?: PointsTable;
  /** playerId → display name, used for the alphabetical tie-break (Czech collation). */
  names?: Record<string, string>;
  /** Players to include even without a match (they get a zero row). */
  playerIds?: string[];
}

function byPlayedAt(a: MatchResult, b: MatchResult): number {
  return a.playedAt < b.playedAt ? -1 : a.playedAt > b.playedAt ? 1 : 0;
}

/** Id of the evening with the latest match, or null. */
export function latestNightId(matches: MatchResult[]): string | null {
  let latest: MatchResult | null = null;
  for (const m of matches) {
    if (m.nightId === null) continue;
    if (!latest || m.playedAt > latest.playedAt) latest = m;
  }
  return latest?.nightId ?? null;
}

/**
 * Season table. Order: league points, then more wins, then more league points in the latest
 * evening, then name alphabetically.
 */
export function seasonStandings(matches: MatchResult[], options: StandingsOptions = {}): StandingRow[] {
  const table = options.table ?? DEFAULT_POINTS_TABLE;
  const names = options.names ?? {};
  const lastNight = latestNightId(matches);
  const rows = new Map<string, StandingRow>();
  const row = (playerId: string): StandingRow => {
    let r = rows.get(playerId);
    if (!r) {
      r = { playerId, points: 0, matches: 0, wins: 0, average: 0, lastNightPoints: 0, place: 0 };
      rows.set(playerId, r);
    }
    return r;
  };
  for (const id of options.playerIds ?? []) row(id);
  for (const match of [...matches].sort(byPlayedAt)) {
    for (const p of matchLeaguePoints(match, table)) {
      const r = row(p.playerId);
      r.points += p.points;
      r.matches++;
      if (p.place === 1) r.wins++;
      if (lastNight !== null && match.nightId === lastNight) r.lastNightPoints += p.points;
    }
  }
  const list = [...rows.values()];
  for (const r of list) r.average = r.matches ? Math.round((r.points / r.matches) * 100) / 100 : 0;
  const rank = (a: StandingRow, b: StandingRow) =>
    b.points - a.points || b.wins - a.wins || b.lastNightPoints - a.lastNightPoints;
  const name = (id: string) => names[id] ?? id;
  list.sort((a, b) => rank(a, b) || name(a.playerId).localeCompare(name(b.playerId), 'cs'));
  list.forEach((r, i) => {
    r.place = i > 0 && rank(list[i - 1], r) === 0 ? list[i - 1].place : i + 1;
  });
  return list;
}

/** Table of one evening; the first row (if any) is the best player of the evening. */
export function nightStandings(matches: MatchResult[], nightId: string, options: StandingsOptions = {}): StandingRow[] {
  return seasonStandings(
    matches.filter((m) => m.nightId === nightId),
    options,
  );
}

/** Best players of the evening: every row on 1st place (usually one). */
export function bestPlayersOfNight(matches: MatchResult[], nightId: string, options: StandingsOptions = {}): StandingRow[] {
  return nightStandings(matches, nightId, options).filter((r) => r.place === 1 && r.matches > 0);
}

/** One table per game type (types without matches get an empty table). */
export function standingsByGameType(
  matches: MatchResult[],
  options: StandingsOptions = {},
): Record<GameType, StandingRow[]> {
  const result = {} as Record<GameType, StandingRow[]>;
  for (const type of GAME_TYPES) {
    const subset = matches.filter((m) => m.gameType === type);
    result[type] = subset.length ? seasonStandings(subset, { ...options, playerIds: undefined }) : [];
  }
  return result;
}
