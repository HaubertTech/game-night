import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson, requireAccount } from '#lib/server/http.ts';
import { rateLimit } from '#lib/server/security.ts';
import { changePassword } from '#lib/server/services/accounts.ts';
import { sessionBody, startSession } from '#lib/server/session.ts';

/** Body: { current_password, password }. Other sessions of the account end. */
export const POST: RequestHandler = async (event) => {
  const { account } = requireAccount(event);
  const body = await readJson(event.request, 4 * 1024);
  rateLimit(event, 'login', `a${account.id}`);
  const outcome = await changePassword(account, body.current_password, body.password);
  startSession(event, outcome);
  return json(sessionBody(outcome));
};
