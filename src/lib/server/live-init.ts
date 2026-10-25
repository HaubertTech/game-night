// Starts the process-wide live hub with the DB room store (when DATABASE_URL is set) and
// restores the active rooms. Shared by server.ts (prod) and the Vite plugin (dev/preview).

import process from 'node:process';
import { loadEnv } from './env.ts';
import { DbRoomStore } from './room-store-db.ts';
import { createLiveHub, setLiveHub, type LiveHub } from './ws.ts';

const INIT_KEY = Symbol.for('domaci-liga.live-hub-init');

type Init = Promise<{ hub: LiveHub; restored: number; store: 'db' | 'memory' }>;

/** Idempotent per process: a second call returns the first hub. */
export function initLiveHub(): Init {
  const g = globalThis as typeof globalThis & { [INIT_KEY]?: Init };
  g[INIT_KEY] ??= (async () => {
    loadEnv();
    const useDb = Boolean(process.env.DATABASE_URL);
    const hub = createLiveHub(useDb ? { store: new DbRoomStore() } : {});
    setLiveHub(hub);
    let restored = 0;
    try {
      restored = await hub.rooms.restore();
    } catch (err) {
      console.error('[live] restoring rooms failed', { err: (err as Error).message });
    }
    if (!useDb) console.warn('[live] DATABASE_URL not set, rooms live in memory only');
    return { hub, restored, store: useDb ? 'db' : 'memory' };
  })();
  return g[INIT_KEY];
}
