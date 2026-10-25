import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson } from '#lib/server/http.ts';
import { rateLimit } from '#lib/server/security.ts';
import { loginWithPin } from '#lib/server/services/accounts.ts';
import { sessionBody, startSession } from '#lib/server/session.ts';

/**
 * PIN login. Body: { pin, name? }. On a device an account has logged in before, the PIN belongs to
 * that household. `name` only finds a household that has no account yet (created before accounts).
 */
export const POST: RequestHandler = async (event) => {
  const body = await readJson(event.request, 4 * 1024);
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : null;
  const device = event.locals.deviceHouseholdId;
  rateLimit(event, 'pin', device ? `h${device}` : name ? `n${name.toLowerCase()}` : null);
  const outcome = await loginWithPin(body.pin, { deviceHouseholdId: device, name: device ? null : name });
  startSession(event, outcome);
  return json(sessionBody(outcome));
};
