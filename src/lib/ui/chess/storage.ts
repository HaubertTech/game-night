// Browser persistence for chess: the running game per mode, the chosen learner and finished
// games waiting for the league. Every access is wrapped — private mode must never break the game.

import type { ChessMatchResult, ChessState } from '../../games/chess/engine.ts';

const PREFIX = 'domaci-liga:chess:';

export type SavedMode = 'ai' | 'local';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = store()?.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    store()?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // full or blocked storage: the game just is not remembered
  }
}

function remove(key: string): void {
  try {
    store()?.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export function loadGame(mode: SavedMode): ChessState | null {
  const s = read<ChessState | null>(`game:${mode}`, null);
  return s && s.v === 1 && typeof s.startFen === 'string' && Array.isArray(s.moves) ? s : null;
}

export function saveGame(mode: SavedMode, state: ChessState): void {
  write(`game:${mode}`, state);
}

export function clearGame(mode: SavedMode): void {
  remove(`game:${mode}`);
}

export interface Learner {
  id: string;
  name: string;
  avatar: string;
  level: 'hospoda' | 'lavice' | 'piskoviste';
}

export const GUEST: Learner = { id: 'host', name: 'Host', avatar: '🦉', level: 'lavice' };

export function loadLearner(): Learner {
  const l = read<Learner | null>('learner', null);
  return l && typeof l.id === 'string' ? l : GUEST;
}

export function saveLearner(l: Learner): void {
  write('learner', l);
}

export interface AiSetup {
  level: number;
  color: 'w' | 'b' | 'random';
  playerId: string | null;
  hints: boolean;
}

export function loadAiSetup(): AiSetup {
  return { level: 2, color: 'w', playerId: null, hints: true, ...read<Partial<AiSetup>>('setup:ai', {}) };
}

export function saveAiSetup(s: AiSetup): void {
  write('setup:ai', s);
}

/** Finished two-player games, kept until the league can record them (newest last, max 50). */
export function rememberFinished(result: ChessMatchResult): void {
  const list = read<ChessMatchResult[]>('finished', []).filter((r) => r.matchId !== result.matchId);
  list.push(result);
  write('finished', list.slice(-50));
}

export function loadFinished(): ChessMatchResult[] {
  return read<ChessMatchResult[]>('finished', []);
}

/** The two-player game on the tablet is between household players and goes to the league. */
export function saveLocalLeague(on: boolean): void {
  write('local:league', on);
}

export function loadLocalLeague(): boolean {
  return read<boolean>('local:league', false) === true;
}

/** League player id behind a chess seat (`p12` → 12), or null for a guest or a tablet profile. */
export function leaguePlayerId(id: string): number | null {
  const m = /^p(\d{1,15})$/.exec(id);
  return m ? Number(m[1]) : null;
}
