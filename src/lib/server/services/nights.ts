// Game nights (večery): a sequence of matches of one household on one day.

import { bestPlayersOfNight, nightStandings, type StandingRow } from '../../league/standings.ts';
import type { GameType } from '../../league/types.ts';
import { one, query, type Queryable } from '../db.ts';
import { loadMatchResults, playerNames } from './league-data.ts';
import { pointsTableFromSeason, ResultError } from './results.ts';
import { getSeason, seasonForDate } from './seasons.ts';

export interface Night {
  id: number;
  household_id: number;
  season_id: number | null;
  season_name: string | null;
  played_on: string;
  title: string | null;
  status: 'open' | 'closed';
  created_at: Date;
  matches: number;
}

export interface NightInput {
  played_on?: string;
  /** undefined = season covering the date; null = no season. */
  season_id?: number | null;
  title?: string | null;
}

const SELECT = `SELECT n.id, n.household_id, n.season_id, s.name AS season_name, n.played_on, n.title, n.status, n.created_at,
       (SELECT COUNT(*)::int FROM matches m WHERE m.night_id = n.id AND m.status <> 'abandoned') AS matches
  FROM game_nights n LEFT JOIN seasons s ON s.id = n.season_id`;

/** Today in Prague as YYYY-MM-DD. */
export function todayPrague(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(now);
}

export async function createNight(householdId: number, input: NightInput = {}, client?: Queryable): Promise<Night> {
  const playedOn = input.played_on ?? todayPrague();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedOn)) throw new ResultError('Datum večera musí být ve tvaru RRRR-MM-DD.');
  let seasonId: number | null;
  if (input.season_id === undefined) {
    seasonId = (await seasonForDate(householdId, playedOn, client))?.id ?? null;
  } else if (input.season_id === null) {
    seasonId = null;
  } else {
    if (!(await getSeason(householdId, input.season_id, client))) throw new ResultError('Taková sezóna neexistuje.', 404);
    seasonId = input.season_id;
  }
  const title = input.title?.trim() || null;
  if (title && title.length > 80) throw new ResultError('Název večera může mít nejvýš 80 znaků.');
  const row = await one<{ id: number }>(
    'INSERT INTO game_nights (household_id, season_id, played_on, title) VALUES ($1, $2, $3, $4) RETURNING id',
    [householdId, seasonId, playedOn, title],
    client,
  );
  return (await getNight(householdId, row!.id, client))!;
}

export async function getNight(householdId: number, id: number, client?: Queryable): Promise<Night | null> {
  return one<Night>(`${SELECT} WHERE n.household_id = $1 AND n.id = $2`, [householdId, id], client);
}

export async function listNights(householdId: number, opts: { seasonId?: number; limit?: number } = {}, client?: Queryable): Promise<Night[]> {
  return query<Night>(
    `${SELECT} WHERE n.household_id = $1 AND ($2::bigint IS NULL OR n.season_id = $2)
      ORDER BY n.played_on DESC, n.id DESC LIMIT $3`,
    [householdId, opts.seasonId ?? null, opts.limit ?? 100],
    client,
  );
}

/** Latest open night of today, if any (home page shortcut). */
export async function openNightToday(householdId: number, client?: Queryable): Promise<Night | null> {
  return one<Night>(`${SELECT} WHERE n.household_id = $1 AND n.status = 'open' AND n.played_on = $2 ORDER BY n.id DESC LIMIT 1`, [householdId, todayPrague()], client);
}

export async function setNightStatus(householdId: number, id: number, status: 'open' | 'closed', client?: Queryable): Promise<Night | null> {
  const row = await one<{ id: number }>(
    'UPDATE game_nights SET status = $3, updated_at = now() WHERE household_id = $1 AND id = $2 RETURNING id',
    [householdId, id, status],
    client,
  );
  return row ? getNight(householdId, id, client) : null;
}

export interface NightMatch {
  id: number;
  game_type: GameType;
  mode: string | null;
  status: string;
  room_code: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  participants: { player_id: number | null; team_id: number | null; name: string; avatar: string; place: number | null; score: number; league_points: number }[];
}

export async function nightMatches(householdId: number, nightId: number, client?: Queryable): Promise<NightMatch[]> {
  const matches = await query<Omit<NightMatch, 'participants'>>(
    `SELECT id, game_type, mode, status, room_code, started_at, finished_at, created_at FROM matches
      WHERE household_id = $1 AND night_id = $2 AND status <> 'abandoned' ORDER BY created_at, id`,
    [householdId, nightId],
    client,
  );
  if (!matches.length) return [];
  const parts = await query<NightMatch['participants'][number] & { match_id: number }>(
    `SELECT mp.match_id, mp.player_id, mp.team_id, COALESCE(p.name, t.name) AS name, COALESCE(p.avatar, t.avatar) AS avatar,
            mp.place, mp.score, mp.league_points
       FROM match_participants mp LEFT JOIN players p ON p.id = mp.player_id LEFT JOIN teams t ON t.id = mp.team_id
      WHERE mp.match_id = ANY($1::bigint[]) ORDER BY mp.place NULLS LAST, mp.id`,
    [matches.map((m) => m.id)],
    client,
  );
  return matches.map((m) => ({ ...m, participants: parts.filter((p) => p.match_id === m.id).map(({ match_id: _m, ...p }) => p) }));
}

export interface NightDetail {
  night: Night;
  matches: NightMatch[];
  standings: StandingRow[];
  best: StandingRow[];
  names: Record<string, string>;
}

export async function nightDetail(householdId: number, nightId: number, client?: Queryable): Promise<NightDetail | null> {
  const night = await getNight(householdId, nightId, client);
  if (!night) return null;
  const season = night.season_id ? await getSeason(householdId, night.season_id, client) : null;
  const table = pointsTableFromSeason(season?.points_table);
  const [results, matches, names] = await Promise.all([
    loadMatchResults(householdId, { nightId }, client),
    nightMatches(householdId, nightId, client),
    playerNames(householdId, client),
  ]);
  const key = String(nightId);
  return {
    night,
    matches,
    standings: nightStandings(results, key, { table, names }),
    best: bestPlayersOfNight(results, key, { table, names }),
    names,
  };
}
