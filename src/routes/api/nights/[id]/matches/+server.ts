import { json, type RequestHandler } from '@sveltejs/kit';
import { parseId, readJson, requireHousehold } from '#lib/server/http.ts';
import { service } from '#lib/server/services/api.ts';
import { createCardMatch, type CardGameType } from '#lib/server/services/cards.ts';

/** New card match in the evening. Body: { game_type: 'prsi' | 'zoliky', player_ids: number[], settings? } */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const nightId = parseId(event.params.id, 'večer');
  const body = await readJson(event.request);
  const match = await service(() =>
    createCardMatch(household.id, {
      gameType: body.game_type as CardGameType,
      playerIds: Array.isArray(body.player_ids) ? body.player_ids.map(Number) : [],
      nightId,
      settings: body.settings && typeof body.settings === 'object' ? (body.settings as object) : undefined,
    }),
  );
  return json({ match }, { status: 201 });
};
