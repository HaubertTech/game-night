import { json, type RequestHandler } from '@sveltejs/kit';
import { one } from '#lib/server/db.ts';

/**
 * Who is logged in. `role`: 'manager' (e-mail + password) or 'device' (PIN). Logged out on a
 * remembered device, `device_household` offers the PIN login. `needs_account`: a household from
 * before accounts — the manager should add e-mail and password.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const household = locals.household;
  const account = locals.account;
  let info: { has_pin: boolean; has_account: boolean } | null = null;
  let device: { id: number; name: string; has_pin: boolean } | null = null;
  const householdId = household?.id ?? locals.deviceHouseholdId;
  if (householdId) {
    const row = await one<{ id: number; name: string; has_pin: boolean; has_account: boolean }>(
      `SELECT h.id, h.name, h.pin_hash IS NOT NULL AS has_pin,
              EXISTS (SELECT 1 FROM accounts a WHERE a.household_id = h.id AND a.deleted_at IS NULL) AS has_account
         FROM households h WHERE h.id = $1`,
      [householdId],
    );
    if (row && household) info = { has_pin: row.has_pin, has_account: row.has_account };
    else if (row) device = { id: row.id, name: row.name, has_pin: row.has_pin };
  }
  return json({
    household: household ? { id: household.id, name: household.name } : null,
    account: account ? { id: account.id, email: account.email, email_verified: Boolean(account.email_verified_at) } : null,
    role: household ? (account ? 'manager' : 'device') : null,
    has_pin: info?.has_pin ?? false,
    needs_account: info ? !info.has_account : false,
    device_household: device,
    // The first-run setup is gone: anyone registers a household with an account.
    setup_required: false,
  });
};
