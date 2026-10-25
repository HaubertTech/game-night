import { json, type RequestHandler } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/server/auth.ts';
import { readJson } from '#lib/server/http.ts';
import { appOrigin, rateLimit } from '#lib/server/security.ts';
import { requestPasswordReset } from '#lib/server/services/accounts.ts';

/** Body: { email }. Same answer whether the address has an account or not. */
export const POST: RequestHandler = async (event) => {
  const body = await readJson(event.request, 4 * 1024);
  rateLimit(event, 'recovery', normalizeEmail(body.email));
  await requestPasswordReset(body.email, appOrigin(event));
  return json({ ok: true, message: 'Pokud k e-mailu existuje účet, poslali jsme na něj odkaz pro nové heslo.' });
};
