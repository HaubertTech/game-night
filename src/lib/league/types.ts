// Input types of the league logic. Everything is plain JSON (ISO strings, no Date/Map),
// so the same shapes can come from the DB, the API or a finished game reducer.

import type { Level, Theme } from '../types.ts';

export const GAME_TYPES = ['quiz', 'aktivity', 'mjz', 'prsi', 'zoliky', 'chess'] as const;
export type GameType = (typeof GAME_TYPES)[number];

export type ParticipantKind = 'player' | 'team';

/** One seat in a finished match: a single player or a team (several player profiles). */
export interface MatchParticipant {
  participantId: string;
  kind: ParticipantKind;
  /** Player profile ids behind the seat; `[participantId]` for a single player. */
  memberIds: string[];
  /** 1-based place; equal places mean a shared place (competition ranking 1, 1, 3). */
  place: number;
  /** Game score (quiz/aktivity/mjz points, prší sum of places, žolíky total, chess 1 / ½ / 0). Informative only. */
  score: number | null;
}

export interface MatchResult {
  matchId: string;
  gameType: GameType;
  /** ISO timestamp of the end of the match. */
  playedAt: string;
  /** Evening the match belongs to; null = standalone match. */
  nightId: string | null;
  participants: MatchParticipant[];
}

/** One answered quiz question, credited to every member of the answering seat. */
export interface AnswerFact {
  matchId: string;
  playedAt: string;
  participantId: string;
  memberIds: string[];
  questionId: string;
  theme: Theme;
  level: Level;
  correct: boolean;
  points: number;
  /** Order of the answer inside the match (for streaks). */
  seq: number;
}

/** League points by place: `places[0]` for 1st place …; anyone further gets `participation`. */
export interface PointsTable {
  places: number[];
  participation: number;
}
