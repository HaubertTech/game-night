import { json, type RequestHandler } from '@sveltejs/kit';
import { hashPin, isValidPin, setSessionCookie } from '#lib/server/auth.ts';
import { tx } from '#lib/server/db.ts';
import { cleanName, fail, readJson } from '#lib/server/http.ts';
import { countHouseholds, createHousehold } from '#lib/server/repo/households.ts';

/** First run only: creates the household and logs this device in. */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const body = await readJson(request);
  const name = cleanName(body.name, 'Název domácnosti', 60);
  if (!isValidPin(body.pin)) fail(400, 'PIN musí mít 4 až 8 číslic.');
  const pinHash = await hashPin(body.pin);
  const household = await tx(async (client) => {
    // Serialize concurrent first-run requests.
    await client.query('LOCK TABLE households IN EXCLUSIVE MODE');
    if ((await countHouseholds(client)) > 0) return null;
    return createHousehold(name, pinHash, client);
  });
  if (!household) fail(409, 'Domácnost už je založená. Přihlas se PINem.');
  setSessionCookie(cookies, household.id, url.protocol === 'https:');
  return json({ household: { id: household.id, name: household.name } }, { status: 201 });
};
