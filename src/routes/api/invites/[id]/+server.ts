import { json, type RequestHandler } from '@sveltejs/kit';
import { fail, parseId, requireAccount } from '#lib/server/http.ts';
import { revokeInvite } from '#lib/server/repo/accounts.ts';

export const DELETE: RequestHandler = async (event) => {
  const { household } = requireAccount(event);
  if (!(await revokeInvite(household.id, parseId(event.params.id, 'pozvánka')))) fail(404, 'Taková pozvánka neexistuje.');
  return json({ ok: true });
};
