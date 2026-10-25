import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson } from '#lib/server/http.ts';
import { rateLimit } from '#lib/server/security.ts';
import { acceptInvite, inviteInfo } from '#lib/server/services/accounts.ts';
import { sessionBody, startSession } from '#lib/server/session.ts';

/** ?token= → which household and e-mail the invite is for. */
export const GET: RequestHandler = async (event) => {
  rateLimit(event, 'token');
  return json(await inviteInfo(event.url.searchParams.get('token')));
};

/** Body: { token, password, accept_terms } → new manager account in the household, logged in. */
export const POST: RequestHandler = async (event) => {
  const body = await readJson(event.request, 4 * 1024);
  rateLimit(event, 'token');
  const outcome = await acceptInvite(body.token, body.password, body.accept_terms);
  startSession(event, outcome);
  return json(sessionBody(outcome), { status: 201 });
};
