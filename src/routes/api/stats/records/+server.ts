import { json, type RequestHandler } from '@sveltejs/kit';
import { requireHousehold } from '#lib/server/http.ts';
import { householdRecordsView } from '#lib/server/services/stats.ts';

export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  return json({ records: await householdRecordsView(household.id) });
};
