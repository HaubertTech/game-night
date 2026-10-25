import { json, type RequestHandler } from '@sveltejs/kit';
import { cleanName, fail, readJson, requireAccount } from '#lib/server/http.ts';
import { renameHousehold } from '#lib/server/repo/households.ts';
import { confirmPassword, setPin } from '#lib/server/services/accounts.ts';
import { deleteHouseholdCompletely } from '#lib/server/services/household-data.ts';
import { clearDeviceCookie, clearSessionCookie } from '#lib/server/auth.ts';
import { getLiveHub } from '#lib/server/ws.ts';

/** Households are created by registration (POST /api/auth/register) since accounts exist. */
export const POST: RequestHandler = async () => {
  fail(410, 'Domácnost se zakládá registrací e-mailem a heslem.');
};

/** Body: { name?, pin?: '1234' | null } — manager only. */
export const PATCH: RequestHandler = async (event) => {
  const { household } = requireAccount(event);
  const body = await readJson(event.request, 4 * 1024);
  let current = household;
  if (body.name !== undefined) current = (await renameHousehold(household.id, cleanName(body.name, 'Název domácnosti', 60))) ?? household;
  if (body.pin !== undefined) await setPin(household, body.pin);
  return json({ household: { id: current.id, name: current.name } });
};

/** Deletes the household with all accounts, players and games. Body: { confirm_name, password }. */
export const DELETE: RequestHandler = async (event) => {
  const { household, account } = requireAccount(event);
  const body = await readJson(event.request, 4 * 1024);
  if (typeof body.confirm_name !== 'string' || body.confirm_name.trim() !== household.name) {
    fail(400, 'Pro potvrzení napiš přesný název domácnosti.');
  }
  await confirmPassword(account, body.password);
  getLiveHub().rooms.closeHouseholdRooms(household.id);
  await deleteHouseholdCompletely(household.id);
  clearSessionCookie(event.cookies);
  clearDeviceCookie(event.cookies);
  return json({ ok: true });
};
