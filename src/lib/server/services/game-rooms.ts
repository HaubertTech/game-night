// Creating live rooms for „Řekni, ukaž, nakresli“, „Město, jméno, zvíře“, chess and the digital
// card games from an API body.
// Contestant ids are `p<playerId>` / `t<teamId>` like in the live quiz, so the DB store can
// record the finished game. Errors are SvelteKit HttpErrors with Czech messages.

import process from 'node:process';
import type { AktivityGoal, AktivityTeam } from '../../games/aktivity/engine.ts';
import { MAX_TEAMS, MAX_TIMER_SECONDS, MIN_TEAMS, MIN_TIMER_SECONDS } from '../../games/aktivity/engine.ts';
import { ADULT_CATEGORIES, KIDS_CATEGORIES, alphabet, type MjzSettings } from '../../games/mjz/engine.ts';
import { createChessGame } from '../../games/chess/engine.ts';
import type { Contestant } from '../../engine/select.ts';
import type { TableSeat } from '../../live/table-games.ts';
import { one } from '../db.ts';
import { fail, isLevel } from '../http.ts';
import { listPlayers, type Player } from '../repo/players.ts';
import { loadSeen } from '../repo/seen.ts';
import { createTeam, findTeamWithMembers, listTeams } from '../repo/teams.ts';
import { DEFAULT_AI_DELAY_MS } from '../games/card-table.ts';
import { createPrsiRoom } from '../games/prsi-hra.ts';
import { createZolikyRoom } from '../games/zoliky-hra.ts';
import type { CreatedRoom } from '../rooms.ts';
import type { LiveHub } from '../ws.ts';

const MAX_MJZ_CONTESTANTS = 12;

export const playerSeat = (id: number) => `p${id}`;
export const teamSeat = (id: number) => `t${id}`;

function idList(raw: unknown, what: string): number[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || !raw.every((id) => Number.isInteger(id) && id > 0)) fail(400, `${what} musí být seznam čísel.`);
  return Array.from(new Set(raw as number[]));
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Open evening of the household the room belongs to, or null. */
export async function resolveNight(householdId: number, raw: unknown): Promise<number | null> {
  if (raw === undefined || raw === null) return null;
  if (!Number.isInteger(raw)) fail(400, 'night_id musí být číslo.');
  const night = await one<{ id: number }>(`SELECT id FROM game_nights WHERE id = $1 AND household_id = $2 AND status = 'open'`, [raw, householdId]);
  if (!night) fail(404, 'Takový otevřený večer neexistuje.');
  return night.id;
}

const seed = () => Math.floor(Math.random() * 2 ** 31);

// ---------- Řekni, ukaž, nakresli ----------

function parseGoal(raw: unknown): AktivityGoal {
  if (raw === undefined || raw === null) return { kind: 'points', points: 30 };
  if (isObj(raw) && raw.kind === 'points' && Number.isInteger(raw.points) && (raw.points as number) >= 1 && (raw.points as number) <= 500) {
    return { kind: 'points', points: raw.points as number };
  }
  if (isObj(raw) && raw.kind === 'rounds' && Number.isInteger(raw.rounds) && (raw.rounds as number) >= 1 && (raw.rounds as number) <= 50) {
    return { kind: 'rounds', rounds: raw.rounds as number };
  }
  return fail(400, 'Cíl hry je počet bodů (1–500) nebo počet kol (1–50).');
}

/**
 * Body: { teams: [{ player_ids: number[] } | { team_id: number }], timer_seconds?, goal?: { kind: 'points', points } |
 * { kind: 'rounds', rounds }, all_play_chance?: 0–1, night_id? }. A team given by players reuses the household
 * team with exactly these members, or creates it (the league records teams).
 */
export async function createAktivityRoom(hub: LiveHub, householdId: number, body: Record<string, unknown>): Promise<CreatedRoom> {
  const rawTeams = body.teams;
  if (!Array.isArray(rawTeams) || rawTeams.length < MIN_TEAMS || rawTeams.length > MAX_TEAMS) {
    fail(400, `Hrají ${MIN_TEAMS} až ${MAX_TEAMS} týmy.`);
  }
  const timer = body.timer_seconds ?? 60;
  if (!Number.isInteger(timer) || (timer as number) < MIN_TIMER_SECONDS || (timer as number) > MAX_TIMER_SECONDS) {
    fail(400, `Čas na tah musí být ${MIN_TIMER_SECONDS} až ${MAX_TIMER_SECONDS} s.`);
  }
  const goal = parseGoal(body.goal);
  const chance = body.all_play_chance ?? 0;
  if (typeof chance !== 'number' || !(chance >= 0 && chance <= 1)) fail(400, 'all_play_chance musí být číslo 0 až 1.');

  const [players, teams] = await Promise.all([listPlayers(householdId), listTeams(householdId)]);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const used = new Set<number>();
  const picks: { members: Player[]; teamId: number | null }[] = [];
  for (const raw of rawTeams as unknown[]) {
    const o = isObj(raw) ? raw : {};
    let memberIds: number[];
    let teamId: number | null = null;
    if (o.team_id !== undefined) {
      const t = Number.isInteger(o.team_id) ? teamById.get(o.team_id as number) : undefined;
      if (!t) fail(400, 'Některé týmy do domácnosti nepatří.');
      memberIds = t.member_ids;
      teamId = t.id;
    } else {
      memberIds = idList(o.player_ids, 'player_ids');
    }
    if (memberIds.length < 2) fail(400, 'Každý tým potřebuje aspoň dva hráče (jeden vysvětluje, druhý hádá).');
    const members = memberIds.map((id) => playerById.get(id) ?? fail(400, 'Někteří hráči do domácnosti nepatří.'));
    for (const m of members) {
      if (used.has(m.id)) fail(400, `Hráč ${m.name} je ve dvou týmech.`);
      used.add(m.id);
    }
    picks.push({ members, teamId });
  }

  const nightId = await resolveNight(householdId, body.night_id);
  const gameTeams: AktivityTeam[] = [];
  for (const pick of picks) {
    let team = pick.teamId !== null ? teamById.get(pick.teamId)! : await findTeamWithMembers(householdId, pick.members.map((m) => m.id));
    team ??= await createTeam(householdId, { name: pick.members.map((m) => m.name).join(' + ').slice(0, 80), member_ids: pick.members.map((m) => m.id) });
    gameTeams.push({
      id: teamSeat(team.id),
      name: team.name,
      avatar: team.avatar,
      players: pick.members.map((m) => ({ id: playerSeat(m.id), name: m.name, avatar: m.avatar, level: m.level })),
    });
  }

  const seenByPlayer = await loadSeen([...used]);
  const seen = [...new Set(Object.values(seenByPlayer).flat())];
  try {
    return await hub.createAktivityRoom(
      { seed: seed(), teams: gameTeams, timerSeconds: timer as number, goal, allPlayChance: chance as number },
      seen,
      { householdId, nightId },
    );
  } catch (err) {
    if ((err as { status?: number }).status) throw err;
    return fail(400, (err as Error).message);
  }
}

// ---------- Město, jméno, zvíře ----------

export const MJZ_CATEGORY_SETS = { adult: ADULT_CATEGORIES, kids: KIDS_CATEGORIES } as const;

/**
 * Body: { player_ids, teams?: [{ id, level }], category_set?: 'adult' | 'kids', rounds?, time_seconds?,
 * include_ch?, kids_bonus?, night_id? }.
 */
export async function createMjzRoom(hub: LiveHub, householdId: number, body: Record<string, unknown>): Promise<CreatedRoom> {
  const playerIds = idList(body.player_ids, 'player_ids');
  const rawTeams = body.teams ?? [];
  if (!Array.isArray(rawTeams)) fail(400, 'teams musí být seznam.');
  const set = body.category_set ?? 'adult';
  if (set !== 'adult' && set !== 'kids') fail(400, 'Sada kategorií je adult nebo kids.');
  const includeCh = body.include_ch ?? false;
  const kidsBonus = body.kids_bonus ?? false;
  if (typeof includeCh !== 'boolean' || typeof kidsBonus !== 'boolean') fail(400, 'include_ch a kids_bonus jsou ano/ne.');
  const rounds = body.rounds ?? 5;
  if (!Number.isInteger(rounds) || (rounds as number) < 1 || (rounds as number) > alphabet(includeCh).length) fail(400, 'Neplatný počet kol.');
  const time = body.time_seconds ?? 90;
  if (!Number.isInteger(time) || (time as number) < 20 || (time as number) > 600) fail(400, 'Čas na psaní musí být 20 až 600 s.');

  const [players, teams] = await Promise.all([listPlayers(householdId), listTeams(householdId)]);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const contestants: Contestant[] = [];
  for (const id of playerIds) {
    const p = playerById.get(id) ?? fail(400, 'Někteří hráči do domácnosti nepatří.');
    contestants.push({ id: playerSeat(p.id), name: p.name, avatar: p.avatar, level: p.level, memberIds: [String(p.id)] });
  }
  const inTeams = new Set<number>();
  for (const raw of rawTeams as unknown[]) {
    const o = isObj(raw) ? raw : {};
    const t = Number.isInteger(o.id) ? teamById.get(o.id as number) : undefined;
    if (!t) fail(400, 'Některé týmy do domácnosti nepatří.');
    if (!isLevel(o.level)) fail(400, 'Tým musí mít úroveň hospoda, lavice nebo piskoviste.');
    for (const m of t.member_ids) {
      if (playerIds.includes(m) || inTeams.has(m)) fail(400, 'Hráč nemůže hrát zároveň sám a v týmu.');
      inTeams.add(m);
    }
    contestants.push({ id: teamSeat(t.id), name: t.name, avatar: t.avatar, level: o.level, memberIds: t.member_ids.map(String) });
  }
  if (contestants.length === 0) fail(400, 'Vyber aspoň jednoho hráče nebo tým.');
  if (contestants.length > MAX_MJZ_CONTESTANTS) fail(400, `Nejvýš ${MAX_MJZ_CONTESTANTS} hráčů.`);

  const nightId = await resolveNight(householdId, body.night_id);
  const settings: Partial<MjzSettings> = {
    rounds: rounds as number,
    timeSeconds: time as number,
    includeCh,
    kidsBonus,
    categories: MJZ_CATEGORY_SETS[set].map((c) => ({ ...c })),
  };
  try {
    return await hub.createMjzRoom({ seed: seed(), contestants, settings }, { householdId, nightId });
  } catch (err) {
    if ((err as { status?: number }).status) throw err;
    return fail(400, 'Neplatné nastavení hry.');
  }
}

// ---------- Šachy ----------

const CHESS_MINUTES = [0, 3, 5, 10, 15, 30];

/** Body: { white_id, black_id, minutes?: 0 | 3 | 5 | 10 | 15 | 30, increment_seconds?: 0–30, night_id? }. */
export async function createChessRoom(hub: LiveHub, householdId: number, body: Record<string, unknown>): Promise<CreatedRoom> {
  const whiteId = body.white_id;
  const blackId = body.black_id;
  if (!Number.isInteger(whiteId) || !Number.isInteger(blackId)) fail(400, 'Vyber bílého i černého hráče.');
  if (whiteId === blackId) fail(400, 'Bílý a černý musí být dva různí hráči.');
  const minutes = body.minutes ?? 0;
  if (!CHESS_MINUTES.includes(minutes as number)) fail(400, 'Neplatný čas na partii.');
  const increment = body.increment_seconds ?? 0;
  if (!Number.isInteger(increment) || (increment as number) < 0 || (increment as number) > 30) fail(400, 'Přídavek musí být 0 až 30 s.');
  const players = await listPlayers(householdId);
  const byId = new Map(players.map((p) => [p.id, p]));
  const white = byId.get(whiteId as number) ?? fail(400, 'Někteří hráči do domácnosti nepatří.');
  const black = byId.get(blackId as number) ?? fail(400, 'Někteří hráči do domácnosti nepatří.');
  const nightId = await resolveNight(householdId, body.night_id);
  const seat = (p: Player) => ({ id: playerSeat(p.id), name: p.name, avatar: p.avatar, level: p.level });
  return hub.rooms.createGameRoom(
    'chess',
    (code, createdAt) =>
      createChessGame({
        id: `chess-${code}`,
        mode: 'room',
        createdAt,
        white: seat(white),
        black: seat(black),
        allowUndo: false,
        clock: minutes ? { minutes: minutes as number, incrementSeconds: increment as number } : null,
      }),
    { householdId, nightId },
  );
}

// ---------- Digitální prší a žolíky ----------

const COMPUTER_NAMES = ['Robík', 'Pixel', 'Bitka', 'Čip'];
const TURN_LIMITS = [null, 15, 30, 45, 60, 90, 120];

function aiDelayMs(): number {
  const raw = Number(process.env.CARD_AI_DELAY_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_AI_DELAY_MS;
}

/**
 * Body: { player_ids, computers?: 0–4, computer_level?: 1 | 2 | 3, hints_for?: player_ids, turn_seconds?: null | 15–120,
 * deals? (prší 1–10), rounds? (žolíky 1–20), night_id? }. 2–5 seats in total; at least one person.
 */
export async function createCardRoom(hub: LiveHub, householdId: number, game: 'prsi-hra' | 'zoliky-hra', body: Record<string, unknown>): Promise<CreatedRoom> {
  const playerIds = idList(body.player_ids, 'player_ids');
  if (playerIds.length === 0) fail(400, 'Vyber aspoň jednoho hráče.');
  const computers = body.computers ?? 0;
  if (!Number.isInteger(computers) || (computers as number) < 0 || (computers as number) > COMPUTER_NAMES.length) fail(400, 'Počítačů může být 0 až 4.');
  const total = playerIds.length + (computers as number);
  if (total < 2 || total > 5) fail(400, 'U stolu sedí 2 až 5 hráčů včetně počítačů.');
  const level = body.computer_level ?? 2;
  if (level !== 1 && level !== 2 && level !== 3) fail(400, 'Síla počítače je 1, 2 nebo 3.');
  const hintsFor = new Set(idList(body.hints_for, 'hints_for'));
  const turnSeconds = body.turn_seconds ?? null;
  if (!TURN_LIMITS.includes(turnSeconds as number | null)) fail(400, 'Neplatný čas na tah.');
  const settingKey = game === 'prsi-hra' ? 'deals' : 'rounds';
  const count = body[settingKey] ?? (game === 'prsi-hra' ? 1 : 10);
  const max = game === 'prsi-hra' ? 10 : 20;
  if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > max) fail(400, `Počet ${game === 'prsi-hra' ? 'partií' : 'kol'} musí být 1 až ${max}.`);

  const players = await listPlayers(householdId);
  const byId = new Map(players.map((p) => [p.id, p]));
  const seats: TableSeat[] = playerIds.map((id) => {
    const p = byId.get(id) ?? fail(400, 'Někteří hráči do domácnosti nepatří.');
    return { id: playerSeat(p.id), name: p.name, avatar: p.avatar, level: p.level, ai: null, hints: hintsFor.has(p.id) };
  });
  for (let i = 0; i < (computers as number); i++) {
    seats.push({ id: `ai${i + 1}`, name: COMPUTER_NAMES[i], avatar: '🤖', level: 'hospoda', ai: level, hints: false });
  }
  const nightId = await resolveNight(householdId, body.night_id);
  const common = { seed: seed(), seats, nightId: nightId === null ? null : String(nightId), turnSeconds: turnSeconds as number | null, aiDelayMs: aiDelayMs() };
  return hub.rooms.createGameRoom(
    game,
    (code, createdAt, now) =>
      game === 'prsi-hra'
        ? createPrsiRoom({ ...common, id: `prsi-${code}`, createdAt, now, settings: { deals: count as number } })
        : createZolikyRoom({ ...common, id: `zoliky-${code}`, createdAt, now, settings: { rounds: count as number } }),
    { householdId, nightId },
  );
}
