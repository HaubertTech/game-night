import { json, type RequestHandler } from '@sveltejs/kit';
import { fail, parseId, readJson, requireHousehold } from '#lib/server/http.ts';
import { nightDetail, setNightStatus } from '#lib/server/services/nights.ts';

export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const detail = await nightDetail(household.id, parseId(event.params.id, 'večer'));
  if (!detail) fail(404, 'Takový večer neexistuje.');
  return json(detail);
};

/** Body: { status: 'open' | 'closed' } */
export const PATCH: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request);
  if (body.status !== 'open' && body.status !== 'closed') fail(400, 'Stav večera musí být open nebo closed.');
  const night = await setNightStatus(household.id, parseId(event.params.id, 'večer'), body.status);
  if (!night) fail(404, 'Takový večer neexistuje.');
  return json({ night });
};
