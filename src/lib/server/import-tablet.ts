// Import of the tablet version (localStorage `exportData()`): profiles, history, seen questions.
// Idempotent: players by legacy_id, games by legacy_id, seen questions by primary key.

import { LEVELS, THEMES, type Level } from '../types.ts';
import { tx, type Queryable } from './db.ts';
import { archivePlayer, createPlayer, findPlayerByLegacyId } from './repo/players.ts';
import { addSeen } from './repo/seen.ts';
import { createTeam, findTeamByMembers } from './repo/teams.ts';
import { createMatch, findMatchByLegacyId, finishMatch, type ParticipantInput, type QuizAnswerInput } from './repo/matches.ts';

export const DEFAULT_POINTS_TABLE = [10, 7, 5, 3, 2, 1];
const MAX_PROFILES = 200;
const MAX_HISTORY = 5000;

export interface TabletProfile {
  id: string;
  name: string;
  avatar: string;
  level: Level;
}

export interface TabletContestant extends TabletProfile {
  memberIds: string[];
}

export interface TabletAnswer {
  round: number;
  contestantId: string;
  questionId: string;
  correct: boolean;
  points: number;
}

export interface TabletGame {
  id: string;
  playedAt: string;
  contestants: TabletContestant[];
  ranking: { contestantId: string; score: number; place: number }[];
  answers: TabletAnswer[];
}

export interface TabletExport {
  profiles: TabletProfile[];
  history: TabletGame[];
  seen: Record<string, string[]>;
}

export interface ImportResult {
  players_created: number;
  players_existing: number;
  teams_created: number;
  matches_created: number;
  matches_skipped: number;
  seen_added: number;
}

export class ImportValidationError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown, max = 200): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isLevel = (v: unknown): v is Level => typeof v === 'string' && (LEVELS as readonly string[]).includes(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function bad(message: string): never {
  throw new ImportValidationError(message);
}

function parseProfile(raw: unknown, where: string): TabletProfile {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name, 60) || !isLevel(raw.level)) bad(`${where}: chybí id, jméno nebo platná úroveň.`);
  return { id: raw.id, name: raw.name.trim(), avatar: typeof raw.avatar === 'string' && raw.avatar ? raw.avatar.slice(0, 16) : '🙂', level: raw.level };
}

/** Validates the uploaded JSON; throws ImportValidationError with a Czech message. */
export function parseTabletExport(raw: unknown): TabletExport {
  if (!isObj(raw)) bad('Soubor nemá tvar exportu z tabletu.');
  const profiles = raw.profiles ?? [];
  const history = raw.history ?? [];
  const seen = raw.seen ?? {};
  if (!Array.isArray(profiles) || !Array.isArray(history) || !isObj(seen)) bad('Export musí obsahovat profiles, history a seen.');
  if (profiles.length > MAX_PROFILES) bad(`Export má víc než ${MAX_PROFILES} profilů.`);
  if (history.length > MAX_HISTORY) bad(`Export má víc než ${MAX_HISTORY} her.`);

  const out: TabletExport = { profiles: profiles.map((p, i) => parseProfile(p, `Profil ${i + 1}`)), history: [], seen: {} };

  history.forEach((g: unknown, i) => {
    const where = `Hra ${i + 1}`;
    if (!isObj(g) || !isStr(g.id) || !isStr(g.playedAt) || Number.isNaN(Date.parse(g.playedAt))) bad(`${where}: chybí id nebo datum.`);
    if (!Array.isArray(g.contestants) || !g.contestants.length || !Array.isArray(g.ranking)) bad(`${where}: chybí soutěžící nebo pořadí.`);
    const contestants = g.contestants.map((c: unknown, j: number) => {
      const base = parseProfile(c, `${where}, soutěžící ${j + 1}`);
      const memberIds = (c as Record<string, unknown>).memberIds;
      if (!Array.isArray(memberIds) || !memberIds.every((m) => isStr(m))) bad(`${where}, soutěžící ${j + 1}: chybí memberIds.`);
      return { ...base, memberIds: memberIds as string[] };
    });
    const ids = new Set(contestants.map((c) => c.id));
    const ranking = g.ranking.map((r: unknown) => {
      if (!isObj(r) || !isStr(r.contestantId) || !ids.has(r.contestantId) || !isNum(r.score) || !isNum(r.place)) bad(`${where}: neplatné pořadí.`);
      return { contestantId: r.contestantId, score: r.score, place: r.place };
    });
    const answers = (Array.isArray(g.answers) ? g.answers : []).map((a: unknown) => {
      if (!isObj(a) || !isStr(a.contestantId) || !ids.has(a.contestantId) || !isStr(a.questionId) || typeof a.correct !== 'boolean') bad(`${where}: neplatná odpověď.`);
      return { round: isNum(a.round) ? a.round : 0, contestantId: a.contestantId, questionId: a.questionId, correct: a.correct, points: isNum(a.points) ? a.points : 0 };
    });
    out.history.push({ id: g.id, playedAt: g.playedAt, contestants, ranking, answers });
  });

  for (const [profileId, ids] of Object.entries(seen)) {
    if (!Array.isArray(ids)) bad('Viděné otázky musí být seznam.');
    out.seen[profileId] = ids.filter((q): q is string => isStr(q));
  }
  return out;
}

/** `<level>-<theme>-NNN` → level and theme; null when the id does not follow the convention. */
export function parseQuestionId(id: string): { level: Level; theme: string } | null {
  const m = /^([a-z]+)-(.+)-\d+$/.exec(id);
  if (!m || !isLevel(m[1]) || !(THEMES as readonly string[]).includes(m[2])) return null;
  return { level: m[1], theme: m[2] };
}

export function leaguePoints(place: number | null, table: readonly number[] = DEFAULT_POINTS_TABLE): number {
  if (!place || place < 1) return 0;
  return table[place - 1] ?? 0;
}

export async function importTablet(householdId: number, data: TabletExport): Promise<ImportResult> {
  return tx((client) => runImport(householdId, data, client));
}

async function runImport(householdId: number, data: TabletExport, client: Queryable): Promise<ImportResult> {
  const result: ImportResult = { players_created: 0, players_existing: 0, teams_created: 0, matches_created: 0, matches_skipped: 0, seen_added: 0 };
  const playerIds = new Map<string, number>();

  async function resolvePlayer(profile: TabletProfile, archived: boolean): Promise<number> {
    const known = playerIds.get(profile.id);
    if (known) return known;
    const existing = await findPlayerByLegacyId(householdId, profile.id, client);
    if (existing) {
      if (!archived) result.players_existing++;
      playerIds.set(profile.id, existing.id);
      return existing.id;
    }
    const created = await createPlayer(householdId, { name: profile.name, avatar: profile.avatar, level: profile.level, legacy_id: profile.id }, client);
    // Profiles deleted on the tablet still own past games; keep them out of the active list.
    if (archived) await archivePlayer(householdId, created.id, client);
    result.players_created++;
    playerIds.set(profile.id, created.id);
    return created.id;
  }

  for (const profile of data.profiles) await resolvePlayer(profile, false);

  for (const game of data.history) {
    if (await findMatchByLegacyId(householdId, game.id, client)) {
      result.matches_skipped++;
      continue;
    }
    const participantKey = new Map<string, Pick<ParticipantInput, 'player_id' | 'team_id'>>();
    const levelOf = new Map<string, Level>();
    for (const c of game.contestants) {
      levelOf.set(c.id, c.level);
      if (c.memberIds.length <= 1) {
        const memberId = c.memberIds[0] ?? c.id;
        const playerId = await resolvePlayer({ ...c, id: memberId }, true);
        participantKey.set(c.id, { player_id: playerId });
      } else {
        const members: number[] = [];
        for (const m of c.memberIds) members.push(await resolvePlayer({ id: m, name: 'Bývalý hráč', avatar: '🙂', level: c.level }, true));
        let team = await findTeamByMembers(householdId, c.name, members, client);
        if (!team) {
          team = await createTeam(householdId, { name: c.name, avatar: c.avatar, member_ids: members }, client);
          result.teams_created++;
        }
        participantKey.set(c.id, { team_id: team.id });
      }
    }

    const ranked = new Map(game.ranking.map((r) => [r.contestantId, r]));
    const participants: ParticipantInput[] = game.contestants.map((c) => {
      const r = ranked.get(c.id);
      const place = r ? Math.round(r.place) : null;
      return { ...participantKey.get(c.id)!, place, score: r?.score ?? 0, league_points: leaguePoints(place) };
    });
    const answers: QuizAnswerInput[] = game.answers.map((a) => {
      const parsed = parseQuestionId(a.questionId);
      return {
        ...participantKey.get(a.contestantId)!,
        question_id: a.questionId,
        theme: parsed?.theme ?? 'neznamé',
        level: parsed?.level ?? levelOf.get(a.contestantId) ?? 'hospoda',
        round_no: a.round + 1,
        correct: a.correct,
        points: a.points,
      };
    });

    const match = await createMatch(
      householdId,
      { game_type: 'quiz', mode: 'pass', status: 'running', legacy_id: game.id, started_at: game.playedAt },
      client,
    );
    await finishMatch(match.id, participants, answers, { finished_at: game.playedAt }, client);
    result.matches_created++;
  }

  for (const [profileId, questionIds] of Object.entries(data.seen)) {
    const playerId = playerIds.get(profileId) ?? (await findPlayerByLegacyId(householdId, profileId, client))?.id;
    if (!playerId) continue;
    result.seen_added += await addSeen(playerId, questionIds, client);
  }
  return result;
}
