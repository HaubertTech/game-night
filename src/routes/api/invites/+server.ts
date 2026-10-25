import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson, requireAccount } from '#lib/server/http.ts';
import { listOpenInvites } from '#lib/server/repo/accounts.ts';
import { appOrigin, rateLimit } from '#lib/server/security.ts';
import { inviteManager } from '#lib/server/services/accounts.ts';

export const GET: RequestHandler = async (event) => {
  const { household } = requireAccount(event);
  const invites = await listOpenInvites(household.id);
  return json({ invites: invites.map((i) => ({ id: i.id, email: i.email, expires_at: i.expires_at })) });
};

/** Invites another adult manager. Body: { email }. */
export const POST: RequestHandler = async (event) => {
  const { household, account } = requireAccount(event);
  const body = await readJson(event.request, 4 * 1024);
  rateLimit(event, 'invite', `h${household.id}`);
  const invite = await inviteManager(household, account, body.email, appOrigin(event));
  return json({ invite }, { status: 201 });
};
