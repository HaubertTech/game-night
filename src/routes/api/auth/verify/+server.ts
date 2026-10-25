import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson } from '#lib/server/http.ts';
import { rateLimit } from '#lib/server/security.ts';
import { verifyEmail } from '#lib/server/services/accounts.ts';

/** Body: { token } from the e-mail link. */
export const POST: RequestHandler = async (event) => {
  const body = await readJson(event.request, 4 * 1024);
  rateLimit(event, 'token');
  const account = await verifyEmail(body.token);
  return json({ email: account.email, email_verified: true });
};
