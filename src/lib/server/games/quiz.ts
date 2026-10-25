// Live quiz in a room: thin adapter over engine/live.ts (behaviour unchanged since v1).

import { applyLive, summarizeLive, type LiveAction, type LiveCommand, type LiveState } from '../../engine/live.ts';
import { PROTOCOL_VERSION, viewFor } from '../../live/protocol.ts';
import type { RecordAnswer, RecordMatchInput, RecordParticipant } from '../services/results.ts';
import { parseSeatId, type GameAdapter } from './types.ts';

/**
 * Result of a finished live game in the shape of recordMatch. Kicked contestants left the game
 * and are not recorded; places are recomputed among the rest (ties share a place).
 */
export function liveRecordInput(matchId: number, state: LiveState, playedAt: string): RecordMatchInput {
  const kicked = new Set(state.kicked);
  const ranking = summarizeLive(state).ranking.filter((r) => !kicked.has(r.contestant.id));
  const participants: RecordParticipant[] = [];
  let place = 0;
  let prevScore: number | null = null;
  ranking.forEach((r, i) => {
    if (prevScore === null || r.score !== prevScore) place = i + 1;
    prevScore = r.score;
    const parsed = parseSeatId(r.contestant.id);
    if (!parsed) throw new Error(`[room-store-db] contestant id ${r.contestant.id} is not a DB id`);
    const memberIds = r.contestant.memberIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    participants.push({
      participantId: r.contestant.id,
      kind: parsed.kind,
      ...(parsed.kind === 'player' ? { playerId: parsed.id } : { teamId: parsed.id }),
      memberIds: parsed.kind === 'player' ? [parsed.id] : memberIds,
      place,
      score: r.score,
    });
  });
  const seats = new Map(participants.map((p) => [p.participantId, p]));
  const answers: RecordAnswer[] = [];
  for (const a of state.answers) {
    const seat = seats.get(a.contestantId);
    const q = state.questions[a.questionId];
    if (!seat || !q) continue;
    answers.push({
      participantId: seat.participantId,
      ...(seat.kind === 'player' ? { playerId: seat.playerId } : { teamId: seat.teamId }),
      questionId: q.id,
      theme: q.theme,
      level: q.level,
      roundNo: a.round + 1,
      correct: a.correct,
      points: a.points,
    });
  }
  return { matchId, gameType: 'quiz', playedAt, participants, answers };
}

export const quizAdapter: GameAdapter<LiveState, LiveCommand> = {
  game: 'quiz',
  apply(state, command, by, now) {
    const result = applyLive(state, { ...command, by, now } as LiveAction);
    return result.ok ? { ok: true, state: result.state } : { ok: false, error: result.error };
  },
  message(state, viewer, presence, now) {
    return { v: PROTOCOL_VERSION, type: 'state', view: viewFor(state, viewer), presence, now };
  },
  timeoutAt: (state) => (state.phase === 'asking' ? state.deadline : null),
  timeout(state, now) {
    const result = applyLive(state, { type: 'timeout', by: { role: 'system' }, now });
    return result.ok ? result.state : null;
  },
  seats: (state) => state.config.contestants.map((c) => ({ id: c.id, joinable: !c.onTv && state.phase !== 'finished' })),
  kicked: (state) => state.kicked,
  kickTarget: (command) => (command.type === 'kick' ? command.contestantId : null),
  isLobby: (state) => state.phase === 'lobby',
  isFinished: (state) => state.phase === 'finished',
  recordInput: liveRecordInput,
};
