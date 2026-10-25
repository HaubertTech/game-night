import { json, type RequestHandler } from '@sveltejs/kit';
import { fail, parseId, requireHousehold } from '#lib/server/http.ts';
import { abandonCardMatch, getCardMatch } from '#lib/server/services/cards.ts';

/** Card match with its score sheet state. */
export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const match = await getCardMatch(household.id, parseId(event.params.id, 'partie'));
  if (!match) fail(404, 'Taková partie neexistuje.');
  return json({ match });
};

/** Drops an unfinished card match. */
export const DELETE: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  if (!(await abandonCardMatch(household.id, parseId(event.params.id, 'partie')))) fail(404, 'Rozehraná partie neexistuje.');
  return json({ ok: true });
};
