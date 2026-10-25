import { json, type RequestHandler } from '@sveltejs/kit';
import { parseId, readJson, requireHousehold } from '#lib/server/http.ts';
import { service } from '#lib/server/services/api.ts';
import { applyCardAction } from '#lib/server/services/cards.ts';

/** Body: { action } — a prší / žolíky reducer action. `finish` records the match. */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const id = parseId(event.params.id, 'partie');
  const body = await readJson(event.request);
  const match = await service(() => applyCardAction(household.id, id, body.action));
  return json({ match });
};
