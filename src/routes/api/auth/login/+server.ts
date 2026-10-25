import { json, type RequestHandler } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/server/auth.ts';
import { readJson } from '#lib/server/http.ts';
import { rateLimit } from '#lib/server/security.ts';
import { loginWithPassword } from '#lib/server/services/accounts.ts';
import { sessionBody, startSession } from '#lib/server/session.ts';

/** Body: { email, password }. */
export const POST: RequestHandler = async (event) => {
  const body = await readJson(event.request, 8 * 1024);
  rateLimit(event, 'login', normalizeEmail(body.email));
  const outcome = await loginWithPassword(body.email, body.password);
  startSession(event, outcome);
  return json(sessionBody(outcome));
};
