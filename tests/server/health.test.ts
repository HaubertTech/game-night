import { afterAll, describe, expect, it, vi } from 'vitest';
import { closePool } from '#lib/server/db.ts';
import { GET } from '../../src/routes/api/health/+server.ts';
import { fakeEvent } from './helpers.ts';

afterAll(() => closePool());

describe('GET /api/health', () => {
  it('returns 200 when the database answers', async () => {
    const res = await GET(fakeEvent({ url: 'http://localhost/api/health' }) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('returns 503 when the database ping fails', async () => {
    vi.resetModules();
    vi.doMock('#lib/server/db.ts', () => ({ query: async () => { throw new Error('down'); } }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { GET: failing } = await import('../../src/routes/api/health/+server.ts');
    const res = await failing(fakeEvent({ url: 'http://localhost/api/health' }) as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'error', db: 'down' });
    expect(err).toHaveBeenCalled();
    vi.doUnmock('#lib/server/db.ts');
    err.mockRestore();
  });
});
