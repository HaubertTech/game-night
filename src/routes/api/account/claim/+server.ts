import { json, type RequestHandler } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/server/auth.ts';
import { readJson, requireHousehold } from '#lib/server/http.ts';
import { appOrigin, rateLimit } from '#lib/server/security.ts';
import { claimHousehold } from '#lib/server/services/accounts.ts';
import { sessionBody, startSession } from '#lib/server/session.ts';

/** „Doplnit účet“ for a household from before accounts. Body: { email, password, accept_terms }. */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request, 8 * 1024);
  rateLimit(event, 'register', normalizeEmail(body.email));
  const outcome = await claimHousehold(household, { email: body.email, password: body.password, acceptTerms: body.accept_terms }, appOrigin(event));
  startSession(event, outcome);
  return json(sessionBody(outcome), { status: 201 });
};
