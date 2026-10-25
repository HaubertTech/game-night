import type { Handle } from '@sveltejs/kit/hooks';
import { clearSessionCookie, COOKIE_NAME, readSessionToken } from '#lib/server/auth.ts';
import { getHousehold } from '#lib/server/repo/households.ts';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.household = null;
  const token = event.cookies.get(COOKIE_NAME);
  if (token) {
    const householdId = readSessionToken(token);
    try {
      const household = householdId ? await getHousehold(householdId) : null;
      if (household) event.locals.household = household;
      else clearSessionCookie(event.cookies);
    } catch (err) {
      // DB outage must not take down static pages; API routes answer 401 until it is back.
      console.error('[auth] household lookup failed', { err: (err as Error).message });
    }
  }
  return resolve(event);
};
