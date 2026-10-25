// OpenSkill (Plackett-Luce, the library default) ratings, kept separately per game type.

import { ordinal, rate, rating } from 'openskill';
import { GAME_TYPES, type GameType, type MatchResult } from './types.ts';

export interface Rating {
  mu: number;
  sigma: number;
}

/** playerId → rating within one game type. */
export type RatingTable = Record<string, Rating>;
export type RatingsByGame = Record<GameType, RatingTable>;

/** Display score = DISPLAY_BASE + ordinal × DISPLAY_SCALE (a new player shows 1000). */
export const DISPLAY_BASE = 1000;
export const DISPLAY_SCALE = 20;

export function initialRating(): Rating {
  const r = rating();
  return { mu: r.mu, sigma: r.sigma };
}

export function emptyRatings(): RatingsByGame {
  const result = {} as RatingsByGame;
  for (const t of GAME_TYPES) result[t] = {};
  return result;
}

/** Conservative skill (μ − 3σ) mapped to a friendly integer. */
export function displayScore(r: Rating): number {
  return Math.round(DISPLAY_BASE + ordinal(r) * DISPLAY_SCALE);
}

export interface RatingChange {
  playerId: string;
  before: Rating;
  after: Rating;
  displayBefore: number;
  displayAfter: number;
  /** displayAfter − displayBefore. */
  delta: number;
}

export function ratingDiff(playerId: string, before: Rating, after: Rating): RatingChange {
  const displayBefore = displayScore(before);
  const displayAfter = displayScore(after);
  return { playerId, before, after, displayBefore, displayAfter, delta: displayAfter - displayBefore };
}

export interface RateMatchResult {
  ratings: RatingTable;
  changes: RatingChange[];
}

/**
 * Rate one match within its game type. Each seat is an OpenSkill team (a single player is a
 * team of one); `place` is the rank, equal places are a draw. Matches with fewer than two
 * seats leave the table unchanged.
 */
export function rateMatch(table: RatingTable, match: MatchResult): RateMatchResult {
  const seats = match.participants.map((p) => (p.memberIds.length ? p.memberIds : [p.participantId]));
  if (seats.length < 2) return { ratings: table, changes: [] };
  const teams = seats.map((members) => members.map((id) => table[id] ?? initialRating()));
  const rated = rate(teams, { rank: match.participants.map((p) => p.place) });
  const ratings: RatingTable = { ...table };
  const changes: RatingChange[] = [];
  seats.forEach((members, i) => {
    members.forEach((id, j) => {
      const before = teams[i][j];
      const after = { mu: rated[i][j].mu, sigma: rated[i][j].sigma };
      ratings[id] = after;
      changes.push(ratingDiff(id, before, after));
    });
  });
  return { ratings, changes };
}

/** Replay matches in `playedAt` order into per-game-type tables. */
export function replayRatings(matches: MatchResult[], start: RatingsByGame = emptyRatings()): RatingsByGame {
  const result: RatingsByGame = { ...start };
  const sorted = [...matches].sort((a, b) => (a.playedAt < b.playedAt ? -1 : a.playedAt > b.playedAt ? 1 : 0));
  for (const m of sorted) result[m.gameType] = rateMatch(result[m.gameType] ?? {}, m).ratings;
  return result;
}

export interface LeaderboardRow {
  playerId: string;
  rating: Rating;
  display: number;
  place: number;
}

/** Players of one game type sorted by display score (equal scores share a place). */
export function ratingLeaderboard(table: RatingTable): LeaderboardRow[] {
  const rows = Object.entries(table).map(([playerId, r]) => ({ playerId, rating: r, display: displayScore(r), place: 0 }));
  rows.sort((a, b) => b.display - a.display || a.playerId.localeCompare(b.playerId));
  rows.forEach((r, i) => {
    r.place = i > 0 && rows[i - 1].display === r.display ? rows[i - 1].place : i + 1;
  });
  return rows;
}
