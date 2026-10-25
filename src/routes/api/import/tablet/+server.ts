import { json, type RequestHandler } from '@sveltejs/kit';
import { fail, readJson, requireHousehold } from '#lib/server/http.ts';
import { ImportValidationError, importTablet, parseTabletExport, type TabletExport } from '#lib/server/import-tablet.ts';

/** Body: the JSON produced by `exportData()` in src/lib/storage.ts. Safe to send repeatedly. */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request);
  let data: TabletExport;
  try {
    data = parseTabletExport(body);
  } catch (err) {
    if (err instanceof ImportValidationError) fail(400, err.message);
    throw err;
  }
  const result = await importTablet(household.id, data);
  console.log('[import] tablet import done', { household: household.id, ...result });
  return json({ result });
};
