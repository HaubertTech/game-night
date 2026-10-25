// Browser persistence: player profiles, game history, seen questions and the running game.
// Every access is wrapped in try/catch — private mode or full storage must never break the game.

import type { Level, Theme } from './types.ts';
import type { GameState, GameSummary } from './engine/quiz.ts';

const PREFIX = 'kvizovna:';
const KEYS = {
  profiles: `${PREFIX}profiles`,
  history: `${PREFIX}history`,
  seen: `${PREFIX}seen`,
  current: `${PREFIX}current-game`,
} as const;

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  level: Level;
}

export interface HistoryEntry {
  id: string;
  playedAt: string;
  themes: Theme[];
  contestants: { id: string; name: string; avatar: string; level: Level; memberIds: string[] }[];
  ranking: { contestantId: string; score: number; place: number }[];
  themeStats: GameSummary['themeStats'];
  best: GameSummary['best'];
  answers: GameState['answers'];
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    storage()?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // ignore
  }
}

// ---------- profiles ----------

export function loadProfiles(): Profile[] {
  const list = read<unknown>(KEYS.profiles, []);
  return Array.isArray(list) ? (list as Profile[]).filter((p) => p && typeof p.id === 'string') : [];
}

export function saveProfiles(profiles: Profile[]): void {
  write(KEYS.profiles, profiles);
}

export function newProfileId(): string {
  return `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ---------- seen questions ----------

export function loadSeen(): Record<string, string[]> {
  const seen = read<unknown>(KEYS.seen, {});
  return seen && typeof seen === 'object' && !Array.isArray(seen) ? (seen as Record<string, string[]>) : {};
}

export function addSeen(byProfile: Record<string, string[]>): void {
  const seen = loadSeen();
  for (const [profileId, ids] of Object.entries(byProfile)) {
    seen[profileId] = Array.from(new Set([...(seen[profileId] ?? []), ...ids]));
  }
  write(KEYS.seen, seen);
}

export function forgetSeen(): void {
  remove(KEYS.seen);
}

// ---------- history ----------

export function loadHistory(): HistoryEntry[] {
  const list = read<unknown>(KEYS.history, []);
  return Array.isArray(list) ? (list as HistoryEntry[]) : [];
}

/** Appends the finished game once (reloading the final screen must not duplicate it). */
export function recordGame(entry: HistoryEntry): boolean {
  const history = loadHistory();
  if (history.some((h) => h.id === entry.id)) return false;
  history.push(entry);
  return write(KEYS.history, history);
}

export function exportData(): { exportedAt: string; profiles: Profile[]; history: HistoryEntry[]; seen: Record<string, string[]> } {
  return { exportedAt: new Date().toISOString(), profiles: loadProfiles(), history: loadHistory(), seen: loadSeen() };
}

/** Starts a download of profiles + history as JSON. */
export function downloadHistory(): void {
  try {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kvizovna-historie-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error('[storage] export failed', { err: (err as Error).message });
  }
}

// ---------- running game ----------

export function saveCurrentGame(state: GameState): void {
  write(KEYS.current, state);
}

export function loadCurrentGame(): GameState | null {
  const state = read<GameState | null>(KEYS.current, null);
  return state && typeof state === 'object' && Array.isArray(state.rounds) && state.config ? state : null;
}

export function clearCurrentGame(): void {
  remove(KEYS.current);
}
