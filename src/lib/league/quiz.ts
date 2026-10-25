// Adapters from a finished quiz (engine/quiz.ts) to league inputs.

import type { Level, Theme } from '../types.ts';
import type { AnswerFact, MatchResult } from './types.ts';

/** Structural subset of engine `Contestant`. */
export interface QuizSeat {
  id: string;
  level: Level;
  memberIds: string[];
}

/** Ranking row: engine `Standing` ({contestant, score, place}) or flat {contestantId, score, place}. */
export type QuizRankingRow =
  | { contestant: { id: string; memberIds: string[] }; score: number; place: number }
  | { contestantId: string; score: number; place: number };

/** Structural subset of engine `AnswerRecord`. */
export interface QuizAnswer {
  contestantId: string;
  questionId: string;
  correct: boolean;
  points: number;
}

export interface QuizMeta {
  matchId: string;
  playedAt: string;
  nightId: string | null;
}

function rowId(row: QuizRankingRow): string {
  return 'contestant' in row ? row.contestant.id : row.contestantId;
}

export function quizToMatchResult(meta: QuizMeta, ranking: QuizRankingRow[], contestants: QuizSeat[]): MatchResult {
  const seats = new Map(contestants.map((c) => [c.id, c]));
  return {
    matchId: meta.matchId,
    gameType: 'quiz',
    playedAt: meta.playedAt,
    nightId: meta.nightId,
    participants: ranking.map((row) => {
      const id = rowId(row);
      const memberIds = ('contestant' in row ? row.contestant.memberIds : seats.get(id)?.memberIds) ?? [id];
      return {
        participantId: id,
        kind: memberIds.length > 1 || (memberIds.length === 1 && memberIds[0] !== id) ? 'team' : 'player',
        memberIds: memberIds.length ? memberIds : [id],
        place: row.place,
        score: row.score,
      };
    }),
  };
}

/**
 * Answer facts for statistics. Theme and level come from the question itself (a preschool mix
 * counts honestly); answers to unknown questions are skipped.
 */
export function quizAnswerFacts(
  meta: QuizMeta,
  answers: QuizAnswer[],
  questions: Record<string, { theme: Theme; level: Level } | undefined>,
  contestants: QuizSeat[],
): AnswerFact[] {
  const seats = new Map(contestants.map((c) => [c.id, c]));
  const facts: AnswerFact[] = [];
  answers.forEach((a, seq) => {
    const q = questions[a.questionId];
    const seat = seats.get(a.contestantId);
    if (!q) return;
    facts.push({
      matchId: meta.matchId,
      playedAt: meta.playedAt,
      participantId: a.contestantId,
      memberIds: seat?.memberIds.length ? seat.memberIds : [a.contestantId],
      questionId: a.questionId,
      theme: q.theme,
      level: q.level,
      correct: a.correct,
      points: a.points,
      seq,
    });
  });
  return facts;
}
