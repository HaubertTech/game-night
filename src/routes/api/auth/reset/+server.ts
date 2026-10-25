import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson } from '#lib/server/http.ts';
import { rateLimit } from '#lib/server/security.ts';
import { resetPassword } from '#lib/server/services/accounts.ts';
import { sessionBody, startSession } from '#lib/server/session.ts';

/** Body: { token, password } — sets the new password and logs in; other sessions of the account end. */
export const POST: RequestHandler = async (event) => {
  const body = await readJson(event.request, 4 * 1024);
  rateLimit(event, 'token');
  const outcome = await resetPassword(body.token, body.password);
  startSession(event, outcome);
  return json(sessionBody(outcome));
};
