// Sending a finished tablet quiz to the server when the household is logged in on this device.
// The tablet game itself never depends on it: every failure only changes the sync status.

import { loadProfiles, type HistoryEntry, type Profile } from '../../storage.ts';

const NIGHT_KEY = 'domaci-liga:tablet-night';

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; nightId: number | null }
  | { state: 'missing'; missing: Profile[] }
  | { state: 'offline' }
  | { state: 'error'; message: string };

/** Remembers which evening the game being started belongs to. */
export function rememberTabletNight(gameId: string, nightId: number | null): void {
  try {
    if (nightId) localStorage.setItem(NIGHT_KEY, JSON.stringify({ gameId, nightId }));
    else localStorage.removeItem(NIGHT_KEY);
  } catch {
    // private mode: the game is recorded without an evening
  }
}

export function tabletNightFor(gameId: string): number | null {
  try {
    const raw = JSON.parse(localStorage.getItem(NIGHT_KEY) ?? 'null') as { gameId?: string; nightId?: number } | null;
    return raw?.gameId === gameId && raw.nightId ? raw.nightId : null;
  } catch {
    return null;
  }
}

export async function syncTabletGame(entry: HistoryEntry, opts: { createMissing?: boolean } = {}): Promise<SyncStatus> {
  try {
    const me = await fetch('/api/me');
    if (!me.ok) return { state: 'offline' };
    const { household } = (await me.json()) as { household: unknown };
    if (!household) return { state: 'idle' };
    const nightId = tabletNightFor(entry.id);
    const res = await fetch('/api/matches/quiz', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: entry, night_id: nightId, create_missing: opts.createMissing === true, profiles: loadProfiles() }),
    });
    const body = (await res.json().catch(() => null)) as { status?: string; missing?: Profile[]; message?: string } | null;
    if (res.status === 409 && body?.status === 'missing') return { state: 'missing', missing: body.missing ?? [] };
    if (!res.ok) return { state: 'error', message: body?.message ?? `Chyba serveru (${res.status}).` };
    return { state: 'saved', nightId };
  } catch {
    return { state: 'offline' };
  }
}
