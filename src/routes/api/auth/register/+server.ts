import { json, type RequestHandler } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/server/auth.ts';
import { readJson } from '#lib/server/http.ts';
import { appOrigin, rateLimit } from '#lib/server/security.ts';
import { register } from '#lib/server/services/accounts.ts';
import { sessionBody, startSession } from '#lib/server/session.ts';

/** Body: { email, password, household_name, accept_terms: true } → new household + manager account, logged in. */
export const POST: RequestHandler = async (event) => {
  const body = await readJson(event.request, 8 * 1024);
  rateLimit(event, 'register', normalizeEmail(body.email));
  const outcome = await register(
    { email: body.email, password: body.password, householdName: body.household_name, acceptTerms: body.accept_terms },
    appOrigin(event),
  );
  startSession(event, outcome);
  return json(sessionBody(outcome), { status: 201 });
};
