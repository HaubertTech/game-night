import { json, type RequestHandler } from '@sveltejs/kit';
import { requireAccount } from '#lib/server/http.ts';
import { appOrigin, rateLimit } from '#lib/server/security.ts';
import { resendVerification } from '#lib/server/services/accounts.ts';

export const POST: RequestHandler = async (event) => {
  const { account } = requireAccount(event);
  rateLimit(event, 'recovery', `a${account.id}`);
  await resendVerification(account, appOrigin(event));
  return json({ ok: true });
};
