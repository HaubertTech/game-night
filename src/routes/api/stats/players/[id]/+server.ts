import { json, type RequestHandler } from '@sveltejs/kit';
import { fail, parseId, requireHousehold } from '#lib/server/http.ts';
import { playerProfile } from '#lib/server/services/stats.ts';

export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const profile = await playerProfile(household.id, parseId(event.params.id, 'hráč'));
  if (!profile) fail(404, 'Takový hráč neexistuje.');
  return json(profile);
};
