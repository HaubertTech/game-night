import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson, requireHousehold } from '#lib/server/http.ts';
import { optionalId, service } from '#lib/server/services/api.ts';
import { createCardMatch, type CardGameType } from '#lib/server/services/cards.ts';

/** New card match, optionally in an evening. Body: { game_type, player_ids, night_id?, settings? } */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request);
  const match = await service(() =>
    createCardMatch(household.id, {
      gameType: body.game_type as CardGameType,
      playerIds: Array.isArray(body.player_ids) ? body.player_ids.map(Number) : [],
      nightId: optionalId(body.night_id, 'číslo večera'),
      settings: body.settings && typeof body.settings === 'object' ? (body.settings as object) : undefined,
    }),
  );
  return json({ match }, { status: 201 });
};
