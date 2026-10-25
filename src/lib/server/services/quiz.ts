// A finished tablet quiz (localStorage history entry) sent to the server. Profiles are paired by
// legacy_id (set by the tablet import); profiles without a counterpart are reported back so the
// UI can offer creating them. Idempotent by the tablet game id (matches.legacy_id).

import type { Level } from '../../types.ts';
import { one, tx } from '../db.ts';
import { parseQuestionId, parseTabletExport, ImportValidationError, type TabletGame, type TabletProfile } from '../import-tablet.ts';
import { createMatch, findMatchByLegacyId } from '../repo/matches.ts';
import { createPlayer, findPlayerByLegacyId } from '../repo/players.ts';
import { createTeam, findTeamByMembers } from '../repo/teams.ts';
import { recordMatch, ResultError, type RecordAnswer, type RecordParticipant } from './results.ts';

export interface TabletQuizInput {
  game: unknown;
  nightId?: number | null;
  /** Create server profiles for tablet profiles that have none. */
  createMissing?: boolean;
  /** Tablet profiles (names of team members, which the history entry does not carry). */
  profiles?: unknown[];
}

export type TabletQuizOutcome =
  | { status: 'recorded'; matchId: number }
  | { status: 'already'; matchId: number }
  | { status: 'missing'; missing: TabletProfile[] };

export function parseTabletGame(raw: unknown): TabletGame {
  try {
    return parseTabletExport({ profiles: [], history: [raw], seen: {} }).history[0];
  } catch (err) {
    if (err instanceof ImportValidationError) throw new ResultError(err.message);
    throw err;
  }
}

/** Profiles behind the seats (team members inherit the team's level and avatar). */
function profilesOf(game: TabletGame, known: TabletProfile[]): TabletProfile[] {
  const byId = new Map(known.map((p) => [p.id, p]));
  const out = new Map<string, TabletProfile>();
  for (const c of game.contestants) {
    if (c.memberIds.length <= 1) {
      const id = c.memberIds[0] ?? c.id;
      out.set(id, { id, name: c.name, avatar: c.avatar, level: c.level });
    } else {
      for (const m of c.memberIds) if (!out.has(m)) out.set(m, byId.get(m) ?? { id: m, name: 'Hráč z tabletu', avatar: '🙂', level: c.level });
    }
  }
  return [...out.values()];
}

export async function recordTabletQuiz(householdId: number, input: TabletQuizInput): Promise<TabletQuizOutcome> {
  const game = parseTabletGame(input.game);
  let known: TabletProfile[] = [];
  try {
    known = parseTabletExport({ profiles: Array.isArray(input.profiles) ? input.profiles : [], history: [], seen: {} }).profiles;
  } catch {
    known = [];
  }
  return tx(async (c) => {
    const existing = await findMatchByLegacyId(householdId, game.id, c);
    if (existing?.status === 'finished') return { status: 'already', matchId: existing.id };

    const playerIds = new Map<string, number>();
    const missing: TabletProfile[] = [];
    for (const p of profilesOf(game, known)) {
      const found = await findPlayerByLegacyId(householdId, p.id, c);
      if (found) playerIds.set(p.id, found.id);
      else missing.push(p);
    }
    if (missing.length && !input.createMissing) return { status: 'missing', missing };
    for (const p of missing) {
      const created = await createPlayer(householdId, { name: p.name.slice(0, 40), avatar: p.avatar, level: p.level, legacy_id: p.id }, c);
      playerIds.set(p.id, created.id);
    }

    if (input.nightId != null) {
      const night = await one<{ id: number }>('SELECT id FROM game_nights WHERE household_id = $1 AND id = $2', [householdId, input.nightId], c);
      if (!night) throw new ResultError('Takový večer neexistuje.', 404);
    }

    const ranked = new Map(game.ranking.map((r) => [r.contestantId, r]));
    const participants: RecordParticipant[] = [];
    const levelOf = new Map<string, Level>();
    for (const contestant of game.contestants) {
      levelOf.set(contestant.id, contestant.level);
      const r = ranked.get(contestant.id);
      const place = r ? Math.max(1, Math.round(r.place)) : game.contestants.length;
      const score = r?.score ?? 0;
      if (contestant.memberIds.length <= 1) {
        const pid = playerIds.get(contestant.memberIds[0] ?? contestant.id)!;
        participants.push({ participantId: contestant.id, kind: 'player', playerId: pid, memberIds: [pid], place, score });
      } else {
        const members = contestant.memberIds.map((m) => playerIds.get(m)!);
        const team =
          (await findTeamByMembers(householdId, contestant.name, members, c)) ??
          (await createTeam(householdId, { name: contestant.name, avatar: contestant.avatar, member_ids: members }, c));
        participants.push({ participantId: contestant.id, kind: 'team', teamId: team.id, memberIds: members, place, score });
      }
    }
    const answers: RecordAnswer[] = game.answers.map((a) => {
      const parsed = parseQuestionId(a.questionId);
      return {
        participantId: a.contestantId,
        questionId: a.questionId,
        theme: parsed?.theme ?? 'neznamé',
        level: parsed?.level ?? levelOf.get(a.contestantId) ?? 'hospoda',
        roundNo: a.round + 1,
        correct: a.correct,
        points: a.points,
      };
    });

    const match =
      existing ??
      (await createMatch(householdId, { game_type: 'quiz', mode: 'pass', status: 'running', legacy_id: game.id, night_id: input.nightId ?? null, started_at: game.playedAt }, c));
    await recordMatch(householdId, { matchId: match.id, gameType: 'quiz', playedAt: game.playedAt, participants, answers }, c);
    return { status: 'recorded', matchId: match.id };
  });
}

