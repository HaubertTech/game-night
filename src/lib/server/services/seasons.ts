// Seasons: period, points table, season table and tables per game type.

import { standingsByGameType, seasonStandings, type StandingRow } from '../../league/standings.ts';
import type { GameType } from '../../league/types.ts';
import { one, query, type Queryable } from '../db.ts';
import { loadMatchResults, playerNames } from './league-data.ts';
import { pointsTableFromSeason, ResultError } from './results.ts';

export interface Season {
  id: number;
  household_id: number;
  name: string;
  starts_on: string;
  ends_on: string;
  points_table: number[];
  created_at: Date;
}

export interface SeasonInput {
  name: string;
  starts_on: string;
  ends_on: string;
  points_table?: number[];
}

const COLUMNS = 'id, household_id, name, starts_on, ends_on, points_table, created_at';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateSeason(input: SeasonInput): void {
  if (!input.name?.trim()) throw new ResultError('Sezóna potřebuje název.');
  if (!DATE_RE.test(input.starts_on) || !DATE_RE.test(input.ends_on)) throw new ResultError('Datum musí být ve tvaru RRRR-MM-DD.');
  if (input.ends_on < input.starts_on) throw new ResultError('Konec sezóny musí být po jejím začátku.');
  const t = input.points_table;
  if (t !== undefined && (!Array.isArray(t) || !t.length || t.length > 20 || !t.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000))) {
    throw new ResultError('Tabulka bodů musí být seznam nezáporných celých čísel.');
  }
}

export async function createSeason(householdId: number, input: SeasonInput, client?: Queryable): Promise<Season> {
  validateSeason(input);
  const overlap = await one<{ name: string }>(
    'SELECT name FROM seasons WHERE household_id = $1 AND starts_on <= $3 AND ends_on >= $2',
    [householdId, input.starts_on, input.ends_on],
    client,
  );
  if (overlap) throw new ResultError(`Období se překrývá se sezónou „${overlap.name}“.`, 409);
  const row = await one<Season>(
    `INSERT INTO seasons (household_id, name, starts_on, ends_on, points_table)
     VALUES ($1, $2, $3, $4, COALESCE($5::jsonb, '[10, 7, 5, 3, 2, 1]'::jsonb)) RETURNING ${COLUMNS}`,
    [householdId, input.name.trim(), input.starts_on, input.ends_on, input.points_table ? JSON.stringify(input.points_table) : null],
    client,
  );
  return row!;
}

export async function listSeasons(householdId: number, client?: Queryable): Promise<Season[]> {
  return query<Season>(`SELECT ${COLUMNS} FROM seasons WHERE household_id = $1 ORDER BY starts_on DESC, id DESC`, [householdId], client);
}

export async function getSeason(householdId: number, id: number, client?: Queryable): Promise<Season | null> {
  return one<Season>(`SELECT ${COLUMNS} FROM seasons WHERE household_id = $1 AND id = $2`, [householdId, id], client);
}

/** The season whose period contains the date (YYYY-MM-DD). */
export async function seasonForDate(householdId: number, date: string, client?: Queryable): Promise<Season | null> {
  return one<Season>(
    `SELECT ${COLUMNS} FROM seasons WHERE household_id = $1 AND starts_on <= $2 AND ends_on >= $2 ORDER BY starts_on DESC LIMIT 1`,
    [householdId, date],
    client,
  );
}

export interface SeasonDetail {
  season: Season;
  standings: StandingRow[];
  byGameType: Record<GameType, StandingRow[]>;
  matches: number;
  names: Record<string, string>;
}

export async function seasonDetail(householdId: number, seasonId: number, client?: Queryable): Promise<SeasonDetail | null> {
  const season = await getSeason(householdId, seasonId, client);
  if (!season) return null;
  const [matches, names] = await Promise.all([loadMatchResults(householdId, { seasonId }, client), playerNames(householdId, client)]);
  const table = pointsTableFromSeason(season.points_table);
  return {
    season,
    standings: seasonStandings(matches, { table, names }),
    byGameType: standingsByGameType(matches, { table, names }),
    matches: matches.length,
    names,
  };
}

/** All-time table (default points table), for households without seasons. */
export async function overallStandings(householdId: number, client?: Queryable): Promise<Omit<SeasonDetail, 'season'>> {
  const [matches, names] = await Promise.all([loadMatchResults(householdId, {}, client), playerNames(householdId, client)]);
  return { standings: seasonStandings(matches, { names }), byGameType: standingsByGameType(matches, { names }), matches: matches.length, names };
}
