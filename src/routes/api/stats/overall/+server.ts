import { json, type RequestHandler } from '@sveltejs/kit';
import { requireHousehold } from '#lib/server/http.ts';
import { overallStandings } from '#lib/server/services/seasons.ts';

/** All-time table and tables per game type. */
export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  return json(await overallStandings(household.id));
};
