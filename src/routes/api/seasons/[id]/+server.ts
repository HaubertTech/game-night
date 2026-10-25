import { json, type RequestHandler } from '@sveltejs/kit';
import { fail, parseId, requireHousehold } from '#lib/server/http.ts';
import { seasonDetail } from '#lib/server/services/seasons.ts';

/** Season table, tables per game type. */
export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const detail = await seasonDetail(household.id, parseId(event.params.id, 'sezóna'));
  if (!detail) fail(404, 'Taková sezóna neexistuje.');
  return json(detail);
};
