import { json, type RequestHandler } from '@sveltejs/kit';
import { fail, parseId, requireAccount } from '#lib/server/http.ts';
import { erasePlayer } from '#lib/server/services/household-data.ts';

/** Erases the player's personal data; results stay under „Smazaný hráč“ (manager only). */
export const POST: RequestHandler = async (event) => {
  const { household } = requireAccount(event);
  if (!(await erasePlayer(household.id, parseId(event.params.id, 'hráč')))) fail(404, 'Takový hráč neexistuje.');
  return json({ ok: true });
};
