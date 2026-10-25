import { json, type RequestHandler } from '@sveltejs/kit';
import { requireHousehold } from '#lib/server/http.ts';
import { ratingLeaderboards } from '#lib/server/services/stats.ts';

export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  return json({ ratings: await ratingLeaderboards(household.id) });
};
