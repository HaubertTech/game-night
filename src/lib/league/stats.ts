// Player statistics from quiz answers, head-to-head duels and household records.

import type { Level, Theme } from '../types.ts';
import type { AnswerFact, GameType, MatchResult } from './types.ts';

export interface SuccessRate {
  correct: number;
  total: number;
  /** correct / total, 0 when total is 0. */
  rate: number;
}

export interface PlayerAnswerStats extends SuccessRate {
  byTheme: Partial<Record<Theme, SuccessRate>>;
  byLevel: Partial<Record<Level, SuccessRate>>;
  /** Highest success among themes with at least `minSample` answers. */
  bestTheme: Theme | null;
  /** Lowest success among themes with at least `minSample` answers (never equal to bestTheme). */
  worstTheme: Theme | null;
  longestStreak: number;
  /** Correct answers in a row at the end of the history. */
  currentStreak: number;
}

export const DEFAULT_MIN_SAMPLE = 5;

function cmpFacts(a: AnswerFact, b: AnswerFact): number {
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
  if (a.matchId !== b.matchId) return a.matchId < b.matchId ? -1 : 1;
  return a.seq - b.seq;
}

function cmpMatches(a: MatchResult, b: MatchResult): number {
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

function add(map: Partial<Record<string, SuccessRate>>, key: string, correct: boolean): void {
  const s = (map[key] ??= { correct: 0, total: 0, rate: 0 });
  s.total++;
  if (correct) s.correct++;
  s.rate = s.correct / s.total;
}

function members(p: { participantId: string; memberIds: string[] }): string[] {
  return p.memberIds.length ? p.memberIds : [p.participantId];
}

/** Longest and trailing streak of correct answers in a chronologically sorted list. */
function streaks(facts: AnswerFact[]): { longest: number; current: number } {
  let longest = 0;
  let current = 0;
  for (const f of facts) {
    current = f.correct ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return { longest, current };
}

export function playerAnswerStats(
  facts: AnswerFact[],
  playerId: string,
  options: { minSample?: number } = {},
): PlayerAnswerStats {
  const minSample = options.minSample ?? DEFAULT_MIN_SAMPLE;
  const mine = facts.filter((f) => members(f).includes(playerId)).sort(cmpFacts);
  const byTheme: Partial<Record<Theme, SuccessRate>> = {};
  const byLevel: Partial<Record<Level, SuccessRate>> = {};
  let correct = 0;
  for (const f of mine) {
    add(byTheme, f.theme, f.correct);
    add(byLevel, f.level, f.correct);
    if (f.correct) correct++;
  }
  const eligible = (Object.entries(byTheme) as [Theme, SuccessRate][])
    .filter(([, s]) => s.total >= minSample)
    .sort((a, b) => b[1].rate - a[1].rate || b[1].total - a[1].total || a[0].localeCompare(b[0]));
  const bestTheme = eligible[0]?.[0] ?? null;
  const last = eligible.length > 1 ? eligible[eligible.length - 1] : null;
  const worstTheme = last && last[1].rate < eligible[0][1].rate ? last[0] : null;
  const { longest, current } = streaks(mine);
  return {
    correct,
    total: mine.length,
    rate: mine.length ? correct / mine.length : 0,
    byTheme,
    byLevel,
    bestTheme,
    worstTheme,
    longestStreak: longest,
    currentStreak: current,
  };
}

export interface HeadToHead {
  opponentId: string;
  /** Matches where both played on different seats. */
  matches: number;
  /** Player finished above the opponent. */
  wins: number;
  losses: number;
  draws: number;
}

/** Duels of `playerId` against everybody they met on a different seat (teammates excluded). */
export function headToHead(matches: MatchResult[], playerId: string, gameType?: GameType): HeadToHead[] {
  const rows = new Map<string, HeadToHead>();
  for (const m of matches) {
    if (gameType && m.gameType !== gameType) continue;
    const mySeat = m.participants.find((p) => members(p).includes(playerId));
    if (!mySeat) continue;
    for (const other of m.participants) {
      if (other === mySeat) continue;
      for (const opponentId of members(other)) {
        if (opponentId === playerId) continue;
        let r = rows.get(opponentId);
        if (!r) rows.set(opponentId, (r = { opponentId, matches: 0, wins: 0, losses: 0, draws: 0 }));
        r.matches++;
        if (mySeat.place < other.place) r.wins++;
        else if (mySeat.place > other.place) r.losses++;
        else r.draws++;
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.matches - a.matches || a.opponentId.localeCompare(b.opponentId));
}

export interface ScoreRecord {
  playerIds: string[];
  participantId: string;
  matchId: string;
  score: number;
}

export interface StreakRecord {
  playerId: string;
  length: number;
}

export interface NightWinsRecord {
  playerId: string;
  nightId: string;
  wins: number;
}

export interface HouseholdRecords {
  /** Highest score of a seat in a quiz match. */
  bestQuizScore: ScoreRecord | null;
  /** Longest run of correct quiz answers. */
  longestAnswerStreak: StreakRecord | null;
  /** Most consecutive matches won (place 1), across all game types. */
  longestWinStreak: StreakRecord | null;
  mostWinsInNight: NightWinsRecord | null;
}

/** Household records. On a tie the earlier holder keeps the record. */
export function householdRecords(matches: MatchResult[], facts: AnswerFact[] = []): HouseholdRecords {
  const sorted = [...matches].sort(cmpMatches);

  let bestQuizScore: ScoreRecord | null = null;
  for (const m of sorted) {
    if (m.gameType !== 'quiz') continue;
    for (const p of m.participants) {
      if (p.score === null) continue;
      if (!bestQuizScore || p.score > bestQuizScore.score) {
        bestQuizScore = { playerIds: members(p), participantId: p.participantId, matchId: m.matchId, score: p.score };
      }
    }
  }

  const players = new Set<string>();
  for (const f of facts) members(f).forEach((id) => players.add(id));
  const sortedFacts = [...facts].sort(cmpFacts);
  let longestAnswerStreak: StreakRecord | null = null;
  for (const playerId of players) {
    const { longest } = streaks(sortedFacts.filter((f) => members(f).includes(playerId)));
    if (longest > 0 && (!longestAnswerStreak || longest > longestAnswerStreak.length)) {
      longestAnswerStreak = { playerId, length: longest };
    }
  }

  const current = new Map<string, number>();
  let longestWinStreak: StreakRecord | null = null;
  const nightWins = new Map<string, NightWinsRecord>();
  let mostWinsInNight: NightWinsRecord | null = null;
  for (const m of sorted) {
    for (const p of m.participants) {
      for (const playerId of members(p)) {
        const won = p.place === 1;
        const run = won ? (current.get(playerId) ?? 0) + 1 : 0;
        current.set(playerId, run);
        if (run > 0 && (!longestWinStreak || run > longestWinStreak.length)) longestWinStreak = { playerId, length: run };
        if (won && m.nightId !== null) {
          const key = `${m.nightId}\u0000${playerId}`;
          const r = nightWins.get(key) ?? { playerId, nightId: m.nightId, wins: 0 };
          r.wins++;
          nightWins.set(key, r);
          if (!mostWinsInNight || r.wins > mostWinsInNight.wins) mostWinsInNight = { ...r };
        }
      }
    }
  }

  return { bestQuizScore, longestAnswerStreak, longestWinStreak, mostWinsInNight };
}
