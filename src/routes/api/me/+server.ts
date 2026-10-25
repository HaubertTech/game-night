import { json, type RequestHandler } from '@sveltejs/kit';
import { countHouseholds } from '#lib/server/repo/households.ts';

/** Who is logged in; `setup_required` tells the UI to offer creating the household. */
export const GET: RequestHandler = async ({ locals }) => {
  const household = locals.household;
  return json({
    household: household ? { id: household.id, name: household.name } : null,
    setup_required: household ? false : (await countHouseholds()) === 0,
  });
};
