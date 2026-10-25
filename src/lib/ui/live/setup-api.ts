// Creating a live room from the TV setup page: POST /api/rooms, keep the host token, open the room.

import { writeToken } from '../../live-client/tokens.ts';

export async function createRoom(body: Record<string, unknown>): Promise<{ code: string } | { unauthorized: true }> {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401) return { unauthorized: true };
  if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
  writeToken('host', data.code, data.host_token);
  return { code: data.code };
}

export function loadSetting<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

export function saveSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode
  }
}
