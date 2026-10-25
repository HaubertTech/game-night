import { json } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { clearSessionCookie, COOKIE_NAME, DEVICE_COOKIE_NAME, readDeviceToken, readSessionToken } from '#lib/server/auth.ts';
import { one } from '#lib/server/db.ts';
import type { Account } from '#lib/server/repo/accounts.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { csrfViolation, isSecureRequest, securityHeaders } from '#lib/server/security.ts';

interface SessionRow {
  household_id: number;
  household_name: string;
  household_created_at: Date;
  account_id: number | null;
  email: string | null;
  email_verified_at: Date | null;
  session_version: number | null;
  account_created_at: Date | null;
}

/** Household and (for an account session) the account, in one query. */
async function loadSession(householdId: number, accountId: number | null): Promise<{ household: Household; account: Account | null } | null> {
  const row = await one<SessionRow>(
    `SELECT h.id AS household_id, h.name AS household_name, h.created_at AS household_created_at,
            a.id AS account_id, a.email, a.email_verified_at, a.session_version, a.created_at AS account_created_at
       FROM households h
       LEFT JOIN accounts a ON a.id = $2 AND a.household_id = h.id AND a.deleted_at IS NULL
      WHERE h.id = $1`,
    [householdId, accountId ?? 0],
  );
  if (!row) return null;
  const household = { id: row.household_id, name: row.household_name, created_at: row.household_created_at };
  if (!accountId) return { household, account: null };
  if (row.account_id === null) return null;
  return {
    household,
    account: {
      id: row.account_id,
      household_id: row.household_id,
      email: row.email!,
      email_verified_at: row.email_verified_at,
      session_version: row.session_version!,
      created_at: row.account_created_at!,
    },
  };
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.household = null;
  event.locals.account = null;
  event.locals.deviceHouseholdId = null;
  const secure = isSecureRequest(event);

  const violation = csrfViolation(event);
  if (violation) {
    console.warn('[security] cross-site request refused', { method: event.request.method, path: event.url.pathname, from: violation });
    const res = json({ message: 'Požadavek z cizí stránky byl odmítnut.' }, { status: 403 });
    for (const [k, v] of Object.entries(securityHeaders(secure))) res.headers.set(k, v);
    return res;
  }

  event.locals.deviceHouseholdId = readDeviceToken(event.cookies.get(DEVICE_COOKIE_NAME));
  const token = event.cookies.get(COOKIE_NAME);
  if (token) {
    const claims = readSessionToken(token);
    try {
      const session = claims ? await loadSession(claims.householdId, claims.accountId) : null;
      if (session && (!session.account || session.account.session_version === claims!.sessionVersion)) {
        event.locals.household = session.household;
        event.locals.account = session.account;
      } else {
        clearSessionCookie(event.cookies);
      }
    } catch (err) {
      // DB outage must not take down static pages; API routes answer 401 until it is back.
      console.error('[auth] session lookup failed', { err: (err as Error).message });
    }
  }

  const response = await resolve(event);
  for (const [k, v] of Object.entries(securityHeaders(secure))) {
    if (!response.headers.has(k)) response.headers.set(k, v);
  }
  if (event.url.pathname.startsWith('/api/') && !response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
  return response;
};
