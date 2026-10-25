import { json, type RequestHandler } from '@sveltejs/kit';
import { clearDeviceCookie, clearSessionCookie } from '#lib/server/auth.ts';

/** Body: { forget_device?: true } — also forgets the household on this device (no PIN login next time). */
export const POST: RequestHandler = async ({ cookies, request }) => {
  let forget = false;
  try {
    forget = (await request.json())?.forget_device === true;
  } catch {
    // empty body is fine
  }
  clearSessionCookie(cookies);
  if (forget) clearDeviceCookie(cookies);
  return json({ ok: true });
};
