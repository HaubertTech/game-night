// Cookies after a successful login/registration, and the JSON the client gets back.

import type { RequestEvent } from '@sveltejs/kit';
import { setDeviceCookie, setSessionCookie } from './auth.ts';
import { isSecureRequest } from './security.ts';
import type { AuthOutcome } from './services/accounts.ts';

export function startSession(event: Pick<RequestEvent, 'cookies' | 'request' | 'url'>, outcome: AuthOutcome): void {
  const secure = isSecureRequest(event);
  setSessionCookie(event.cookies, outcome.claims, secure);
  // Remember the household on this device: next time the PIN is enough.
  setDeviceCookie(event.cookies, outcome.household.id, secure);
}

export function sessionBody(outcome: AuthOutcome) {
  return {
    household: { id: outcome.household.id, name: outcome.household.name },
    account: outcome.account ? { id: outcome.account.id, email: outcome.account.email, email_verified: Boolean(outcome.account.email_verified_at) } : null,
  };
}
