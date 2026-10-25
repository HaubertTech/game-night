import { json, type RequestHandler } from '@sveltejs/kit';
import { THEMES, type Theme } from '#lib/types.ts';
import type { Contestant } from '#lib/engine/quiz.ts';
import { one } from '#lib/server/db.ts';
import { fail, isLevel, readJson, requireHousehold } from '#lib/server/http.ts';
import { playerContestantId, teamContestantId } from '#lib/server/room-store-db.ts';
import { listPlayers } from '#lib/server/repo/players.ts';
import { loadSeen } from '#lib/server/repo/seen.ts';
import { listTeams } from '#lib/server/repo/teams.ts';
import { createAktivityRoom, createCardRoom, createChessRoom, createCloveceRoomFor, createMjzRoom } from '#lib/server/services/game-rooms.ts';
import { getLiveHub } from '#lib/server/ws.ts';

const MAX_CONTESTANTS = 12;
/** Unfinished live rooms one household may have open at a time. */
const MAX_ACTIVE_ROOMS = 4;
const TIMERS = [null, 10, 15, 20, 30, 45, 60, 90];

function idList(raw: unknown, what: string): number[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || !raw.every((id) => Number.isInteger(id) && id > 0)) fail(400, `${what} musí být seznam čísel.`);
  return Array.from(new Set(raw as number[]));
}

/**
 * Creates a live room for the logged-in household.
 * `game` = 'quiz' (default) | 'aktivity' | 'mjz' | 'chess' | 'prsi-hra' | 'zoliky-hra' | 'clovece'; the rest of
 * the body depends on the game (see services/game-rooms.ts).
 * Quiz body: { player_ids, teams: [{ id, level }], themes, questions_per_contestant, timer_seconds, on_tv: [contestantId], night_id }
 */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request, 32 * 1024);
  if (getLiveHub().rooms.activeRoomCount(household.id) >= MAX_ACTIVE_ROOMS) {
    fail(409, `Domácnost má otevřené ${MAX_ACTIVE_ROOMS} rozehrané místnosti. Nejdřív nějakou dohraj.`);
  }
  const game = body.game ?? 'quiz';
  if (game === 'aktivity' || game === 'mjz') {
    const room = game === 'aktivity' ? await createAktivityRoom(getLiveHub(), household.id, body) : await createMjzRoom(getLiveHub(), household.id, body);
    return json({ code: room.code, host_token: room.hostToken, game }, { status: 201 });
  }
  if (game === 'chess' || game === 'prsi-hra' || game === 'zoliky-hra') {
    const room = game === 'chess' ? await createChessRoom(getLiveHub(), household.id, body) : await createCardRoom(getLiveHub(), household.id, game, body);
    return json({ code: room.code, host_token: room.hostToken, game }, { status: 201 });
  }
  if (game === 'clovece') {
    const room = await createCloveceRoomFor(getLiveHub(), household.id, body);
    return json({ code: room.code, host_token: room.hostToken, game }, { status: 201 });
  }
  if (game !== 'quiz') fail(400, 'Neznámá hra.');

  const playerIds = idList(body.player_ids, 'player_ids');
  const rawTeams = body.teams ?? [];
  if (!Array.isArray(rawTeams)) fail(400, 'teams musí být seznam.');
  const teamPicks = (rawTeams as unknown[]).map((t) => {
    const o = (t ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(o.id) || (o.id as number) <= 0) fail(400, 'Tým musí mít id.');
    if (!isLevel(o.level)) fail(400, 'Tým musí mít úroveň hospoda, lavice nebo piskoviste.');
    return { id: o.id as number, level: o.level };
  });

  const themes = body.themes;
  if (!Array.isArray(themes) || themes.length === 0 || !themes.every((t) => (THEMES as readonly unknown[]).includes(t))) {
    fail(400, 'Vyber aspoň jedno platné téma.');
  }
  const uniqueThemes = Array.from(new Set(themes as Theme[]));
  const perContestant = body.questions_per_contestant ?? 2;
  if (!Number.isInteger(perContestant) || (perContestant as number) < 1 || (perContestant as number) > 10) {
    fail(400, 'Počet otázek na hráče musí být 1 až 10.');
  }
  const timer = body.timer_seconds ?? null;
  if (!TIMERS.includes(timer as number | null)) fail(400, 'Neplatný časovač.');
  const onTv = new Set(Array.isArray(body.on_tv) ? (body.on_tv as unknown[]).filter((x): x is string => typeof x === 'string') : []);

  const [players, teams] = await Promise.all([listPlayers(household.id), listTeams(household.id)]);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const contestants: (Contestant & { onTv: boolean })[] = [];
  for (const id of playerIds) {
    const p = playerById.get(id);
    if (!p) fail(400, 'Někteří hráči do domácnosti nepatří.');
    const cid = playerContestantId(p.id);
    contestants.push({ id: cid, name: p.name, avatar: p.avatar, level: p.level, memberIds: [String(p.id)], onTv: onTv.has(cid) });
  }
  const inTeams = new Set<number>();
  for (const pick of teamPicks) {
    const t = teamById.get(pick.id);
    if (!t) fail(400, 'Některé týmy do domácnosti nepatří.');
    for (const m of t.member_ids) {
      if (playerIds.includes(m) || inTeams.has(m)) fail(400, 'Hráč nemůže hrát zároveň sám a v týmu.');
      inTeams.add(m);
    }
    const cid = teamContestantId(t.id);
    contestants.push({ id: cid, name: t.name, avatar: t.avatar, level: pick.level, memberIds: t.member_ids.map(String), onTv: onTv.has(cid) });
  }
  if (contestants.length === 0) fail(400, 'Vyber aspoň jednoho hráče nebo tým.');
  if (contestants.length > MAX_CONTESTANTS) fail(400, `Nejvýš ${MAX_CONTESTANTS} soutěžících.`);

  // drawGame keys `seen` by contestant: a team has seen what any of its members has.
  const memberIds = Array.from(new Set(contestants.flatMap((c) => c.memberIds.map(Number))));
  const seenByPlayer = await loadSeen(memberIds);
  const seen: Record<string, string[]> = {};
  for (const c of contestants) seen[c.id] = Array.from(new Set(c.memberIds.flatMap((m) => seenByPlayer[m] ?? [])));

  let nightId: number | null = null;
  if (body.night_id !== undefined && body.night_id !== null) {
    if (!Number.isInteger(body.night_id)) fail(400, 'night_id musí být číslo.');
    const night = await one<{ id: number }>(
      `SELECT id FROM game_nights WHERE id = $1 AND household_id = $2 AND status = 'open'`,
      [body.night_id, household.id],
    );
    if (!night) fail(404, 'Takový otevřený večer neexistuje.');
    nightId = night.id;
  }
  const room = await getLiveHub().createRoom(
    {
      seed: Math.floor(Math.random() * 2 ** 31),
      themes: uniqueThemes,
      questionsPerContestant: perContestant as number,
      timerSeconds: timer as number | null,
      contestants,
    },
    seen,
    { householdId: household.id, nightId },
  );
  return json({ code: room.code, host_token: room.hostToken }, { status: 201 });
};
