import { json, type RequestHandler } from '@sveltejs/kit';
import { clearSessionCookie } from '#lib/server/auth.ts';
import { readJson, requireAccount } from '#lib/server/http.ts';
import { listHouseholdAccounts, listOpenInvites } from '#lib/server/repo/accounts.ts';
import { getHouseholdWithPin } from '#lib/server/repo/households.ts';
import { deleteOwnAccount } from '#lib/server/services/accounts.ts';

/** Household settings for the manager: managers, open invites, whether a PIN is set. */
export const GET: RequestHandler = async (event) => {
  const { household, account } = requireAccount(event);
  const [accounts, invites, withPin] = await Promise.all([
    listHouseholdAccounts(household.id),
    listOpenInvites(household.id),
    getHouseholdWithPin(household.id),
  ]);
  return json({
    household: { id: household.id, name: household.name, has_pin: Boolean(withPin?.pin_hash) },
    account: { id: account.id, email: account.email, email_verified: Boolean(account.email_verified_at) },
    managers: accounts.map((a) => ({ id: a.id, email: a.email, email_verified: Boolean(a.email_verified_at), me: a.id === account.id })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, expires_at: i.expires_at })),
  });
};

/** Deletes the caller's own account (not the last manager). Body: { password }. */
export const DELETE: RequestHandler = async (event) => {
  const { account } = requireAccount(event);
  const body = await readJson(event.request, 4 * 1024);
  await deleteOwnAccount(account, body.password);
  clearSessionCookie(event.cookies);
  return json({ ok: true });
};
