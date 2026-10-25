// League points for a finished match.

import type { MatchResult, PointsTable } from './types.ts';

export const DEFAULT_POINTS_TABLE: PointsTable = { places: [10, 7, 5, 3, 2, 1], participation: 1 };

/** Points for one exclusive position (1-based). */
export function pointsForPosition(position: number, table: PointsTable = DEFAULT_POINTS_TABLE): number {
  if (!Number.isInteger(position) || position < 1) return 0;
  return table.places[position - 1] ?? table.participation;
}

/**
 * Points for every seat given their places. Seats sharing a place split the positions they
 * occupy: two seats on 1st place get ceil((10 + 7) / 2) = 9 each.
 * Returns points in the same order as `places`.
 */
export function pointsForPlaces(places: number[], table: PointsTable = DEFAULT_POINTS_TABLE): number[] {
  const order = places.map((place, index) => ({ place, index })).sort((a, b) => a.place - b.place);
  const result = new Array<number>(places.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].place === order[i].place) j++;
    let sum = 0;
    for (let pos = i + 1; pos <= j + 1; pos++) sum += pointsForPosition(pos, table);
    const shared = Math.ceil(sum / (j - i + 1));
    for (let k = i; k <= j; k++) result[order[k].index] = shared;
    i = j + 1;
  }
  return result;
}

export interface PlayerMatchPoints {
  playerId: string;
  participantId: string;
  place: number;
  points: number;
}

/** League points per player: a team's points go in full to each member. */
export function matchLeaguePoints(match: MatchResult, table: PointsTable = DEFAULT_POINTS_TABLE): PlayerMatchPoints[] {
  const points = pointsForPlaces(
    match.participants.map((p) => p.place),
    table,
  );
  const rows: PlayerMatchPoints[] = [];
  match.participants.forEach((p, i) => {
    const members = p.memberIds.length > 0 ? p.memberIds : [p.participantId];
    for (const playerId of members) {
      rows.push({ playerId, participantId: p.participantId, place: p.place, points: points[i] });
    }
  });
  return rows;
}
