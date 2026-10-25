import { json, type RequestHandler } from '@sveltejs/kit';
import { isValidPin, setSessionCookie, verifyPin } from '#lib/server/auth.ts';
import { fail, readJson } from '#lib/server/http.ts';
import { findHouseholdForLogin } from '#lib/server/repo/households.ts';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const body = await readJson(request);
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  if (!isValidPin(body.pin)) fail(400, 'PIN musí mít 4 až 8 číslic.');
  const household = await findHouseholdForLogin(name);
  if (!household || !(await verifyPin(body.pin, household.pin_hash))) fail(401, 'Špatný PIN.');
  setSessionCookie(cookies, household.id, url.protocol === 'https:');
  return json({ household: { id: household.id, name: household.name } });
};
