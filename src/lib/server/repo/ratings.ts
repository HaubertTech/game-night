import { query, type Queryable } from '../db.ts';
import type { GameType } from './matches.ts';

export interface Rating {
  player_id: number;
  game_type: GameType;
  mu: number;
  sigma: number;
  games: number;
  updated_at: Date;
}

export interface RatingInput {
  player_id: number;
  game_type: GameType;
  mu: number;
  sigma: number;
  /** Total games after this update. */
  games: number;
}

/** Ratings of the household's players for one game type. */
export async function listRatings(householdId: number, gameType: GameType, client?: Queryable): Promise<Rating[]> {
  return query<Rating>(
    `SELECT r.player_id, r.game_type, r.mu, r.sigma, r.games, r.updated_at
       FROM ratings r JOIN players p ON p.id = r.player_id
      WHERE p.household_id = $1 AND r.game_type = $2
      ORDER BY r.mu - 3 * r.sigma DESC`,
    [householdId, gameType],
    client,
  );
}

export async function getRatings(playerIds: readonly number[], gameType: GameType, client?: Queryable): Promise<Rating[]> {
  if (!playerIds.length) return [];
  return query<Rating>(
    'SELECT player_id, game_type, mu, sigma, games, updated_at FROM ratings WHERE game_type = $2 AND player_id = ANY($1::bigint[])',
    [playerIds, gameType],
    client,
  );
}

export async function upsertRatings(rows: readonly RatingInput[], client?: Queryable): Promise<void> {
  for (const r of rows) {
    await query(
      `INSERT INTO ratings (player_id, game_type, mu, sigma, games) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (player_id, game_type) DO UPDATE SET mu = EXCLUDED.mu, sigma = EXCLUDED.sigma, games = EXCLUDED.games, updated_at = now()`,
      [r.player_id, r.game_type, r.mu, r.sigma, r.games],
      client,
    );
  }
}
