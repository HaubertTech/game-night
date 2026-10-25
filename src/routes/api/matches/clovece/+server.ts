import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson, requireHousehold } from '#lib/server/http.ts';
import { optionalId, service } from '#lib/server/services/api.ts';
import { recordTabletClovece } from '#lib/server/services/clovece.ts';

/**
 * A finished Člověče, nezlob se game from one tablet. Body: { game: { id, createdAt, seed, settings,
 * players: [{ id: 'p<id>' | 'ai<n>', ai? }], history }, night_id? }. The server replays it.
 * 200 { status: 'recorded' | 'already', match_id }.
 */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request, 256 * 1024);
  const outcome = await service(() => recordTabletClovece(household.id, body.game, optionalId(body.night_id, 'číslo večera')));
  return json({ status: outcome.status, match_id: outcome.matchId });
};
