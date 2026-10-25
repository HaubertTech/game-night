// Player profile statistics, rating leaderboards and household records.

import { displayScore, initialRating } from '../../league/ratings.ts';
import { playerAnswerStats, headToHead, householdRecords, type HeadToHead, type HouseholdRecords, type PlayerAnswerStats } from '../../league/stats.ts';
import { GAME_TYPES, type GameType } from '../../league/types.ts';
import { query, type Queryable } from '../db.ts';
import { getPlayer, type Player } from '../repo/players.ts';
import { listRatings } from '../repo/ratings.ts';
import { loadAnswerFacts, loadMatchResults, playerNames } from './league-data.ts';

export interface RatingView {
  game_type: GameType;
  display: number;
  mu: number;
  sigma: number;
  games: number;
}

export interface PlayerMatchRow {
  match_id: number;
  game_type: GameType;
  night_id: number | null;
  finished_at: Date;
  place: number | null;
  score: number;
  league_points: number;
  seats: number;
  team_name: string | null;
}

export interface PlayerProfile {
  player: Player;
  ratings: RatingView[];
  league: { points: number; matches: number; wins: number };
  answers: PlayerAnswerStats;
  winStreak: { longest: number; current: number };
  history: PlayerMatchRow[];
  headToHead: (HeadToHead & { name: string })[];
}

/** Statistics need a few answers per theme before it counts as best/worst. */
const MIN_THEME_SAMPLE = 3;

export async function playerProfile(householdId: number, playerId: number, client?: Queryable): Promise<PlayerProfile | null> {
  const player = await getPlayer(householdId, playerId, client);
  if (!player) return null;
  const key = String(playerId);
  const [ratingRows, matches, facts, names, history] = await Promise.all([
    query<{ game_type: GameType; mu: number; sigma: number; games: number }>(
      'SELECT game_type, mu, sigma, games FROM ratings WHERE player_id = $1',
      [playerId],
      client,
    ),
    loadMatchResults(householdId, { playerId }, client),
    loadAnswerFacts(householdId, { playerId }, client),
    playerNames(householdId, client),
    query<PlayerMatchRow>(
      `SELECT m.id AS match_id, m.game_type, m.night_id, m.finished_at, mp.place, mp.score, mp.league_points,
              (SELECT COUNT(*)::int FROM match_participants x WHERE x.match_id = m.id) AS seats,
              t.name AS team_name
         FROM match_participants mp
         JOIN matches m ON m.id = mp.match_id
         LEFT JOIN teams t ON t.id = mp.team_id
        WHERE m.household_id = $1 AND m.status = 'finished'
          AND (mp.player_id = $2 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = mp.team_id AND tm.player_id = $2))
        ORDER BY m.finished_at DESC, m.id DESC LIMIT 50`,
      [householdId, playerId],
      client,
    ),
  ]);

  const ratings: RatingView[] = GAME_TYPES.map((game_type) => {
    const r = ratingRows.find((x) => x.game_type === game_type);
    const rating = r ? { mu: r.mu, sigma: r.sigma } : initialRating();
    return { game_type, display: displayScore(rating), mu: rating.mu, sigma: rating.sigma, games: r?.games ?? 0 };
  });

  const leagueRow = await query<{ points: number; matches: number; wins: number }>(
    `SELECT COALESCE(SUM(mp.league_points), 0)::int AS points, COUNT(*)::int AS matches, COUNT(*) FILTER (WHERE mp.place = 1)::int AS wins
       FROM match_participants mp JOIN matches m ON m.id = mp.match_id
      WHERE m.household_id = $1 AND m.status = 'finished'
        AND (mp.player_id = $2 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = mp.team_id AND tm.player_id = $2))`,
    [householdId, playerId],
    client,
  );

  // Win streaks over all games, chronologically.
  let longest = 0;
  let current = 0;
  for (const m of matches) {
    const seat = m.participants.find((p) => p.memberIds.includes(key));
    if (!seat) continue;
    current = seat.place === 1 ? current + 1 : 0;
    longest = Math.max(longest, current);
  }

  return {
    player,
    ratings,
    league: leagueRow[0],
    answers: playerAnswerStats(facts, key, { minSample: MIN_THEME_SAMPLE }),
    winStreak: { longest, current },
    history,
    headToHead: headToHead(matches, key).map((h) => ({ ...h, name: names[h.opponentId] ?? '?' })),
  };
}

export interface LeaderboardEntry {
  player_id: number;
  name: string;
  avatar: string;
  display: number;
  games: number;
  place: number;
}

/** Rating leaderboard per game type (only players with at least one rated game). */
export async function ratingLeaderboards(householdId: number, client?: Queryable): Promise<Record<GameType, LeaderboardEntry[]>> {
  const players = await query<{ id: number; name: string; avatar: string }>(
    'SELECT id, name, avatar FROM players WHERE household_id = $1 AND archived_at IS NULL',
    [householdId],
    client,
  );
  const byId = new Map(players.map((p) => [p.id, p]));
  const out = {} as Record<GameType, LeaderboardEntry[]>;
  for (const type of GAME_TYPES) {
    const rows = (await listRatings(householdId, type, client))
      .filter((r) => byId.has(r.player_id))
      .map((r) => ({ player_id: r.player_id, name: byId.get(r.player_id)!.name, avatar: byId.get(r.player_id)!.avatar, display: displayScore(r), games: r.games, place: 0 }))
      .sort((a, b) => b.display - a.display || a.name.localeCompare(b.name, 'cs'));
    rows.forEach((r, i) => (r.place = i > 0 && rows[i - 1].display === r.display ? rows[i - 1].place : i + 1));
    out[type] = rows;
  }
  return out;
}

export interface RecordsView extends HouseholdRecords {
  names: Record<string, string>;
}

export async function householdRecordsView(householdId: number, client?: Queryable): Promise<RecordsView> {
  const [matches, facts, names] = await Promise.all([
    loadMatchResults(householdId, {}, client),
    loadAnswerFacts(householdId, {}, client),
    playerNames(householdId, client),
  ]);
  return { ...householdRecords(matches, facts), names };
}

