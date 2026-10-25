import { json, type RequestHandler } from '@sveltejs/kit';
import { query } from '#lib/server/db.ts';
import { fail, parseId, requireHousehold } from '#lib/server/http.ts';

/** Archives the team; past matches stay. */
export const DELETE: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const rows = await query(
    'UPDATE teams SET archived_at = COALESCE(archived_at, now()), updated_at = now() WHERE household_id = $1 AND id = $2 RETURNING id',
    [household.id, parseId(event.params.id, 'tým')],
  );
  if (!rows.length) fail(404, 'Takový tým neexistuje.');
  return json({ ok: true });
};
