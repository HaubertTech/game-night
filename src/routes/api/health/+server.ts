import { query } from '#lib/server/db.ts';
import { json, type RequestHandler } from '@sveltejs/kit';

const headers = { 'cache-control': 'no-store' };

export const GET: RequestHandler = async () => {
  try {
    await query('SELECT 1');
    return json({ status: 'ok', db: 'ok' }, { headers });
  } catch (err) {
    console.error('[health] db ping failed', { err: (err as Error).message });
    return json({ status: 'error', db: 'down' }, { status: 503, headers });
  }
};
