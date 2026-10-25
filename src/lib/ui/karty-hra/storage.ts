// Browser persistence of the training games: the running game and the last setup.
// Every access is wrapped in try/catch — private mode or full storage must never break the game.

import type { AiLevel } from '#lib/games/karty-hra/prsi-engine.ts';
import type { Audience } from '#lib/games/karty-hra/learn/lessons.ts';

const PREFIX = 'karty-hra:';

export type TrainingGame = 'prsi' | 'zoliky';

export interface TrainingSetup {
  name: string;
  opponents: number;
  level: AiLevel;
  hints: boolean;
  audience: Audience;
  /** Prší: deals per game; žolíky: rounds. */
  length: number;
}

export const DEFAULT_SETUP: Record<TrainingGame, TrainingSetup> = {
  prsi: { name: 'Já', opponents: 2, level: 1, hints: true, audience: 'kid', length: 1 },
  zoliky: { name: 'Já', opponents: 1, level: 1, hints: true, audience: 'kid', length: 10 },
};

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = storage()?.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) storage()?.removeItem(PREFIX + key);
    else storage()?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the game simply is not resumable.
  }
}

export function loadSetup(game: TrainingGame): TrainingSetup {
  return { ...DEFAULT_SETUP[game], ...read<Partial<TrainingSetup>>(`${game}:setup`) };
}

export function saveSetup(game: TrainingGame, setup: TrainingSetup): void {
  write(`${game}:setup`, setup);
}

export interface SavedGame<S> {
  setup: TrainingSetup;
  state: S;
}

export function loadGame<S>(game: TrainingGame): SavedGame<S> | null {
  return read<SavedGame<S>>(`${game}:current`);
}

export function saveGame<S>(game: TrainingGame, saved: SavedGame<S> | null): void {
  write(`${game}:current`, saved);
}

export function lessonProgress(game: TrainingGame): number {
  return read<number>(`${game}:lesson`) ?? 0;
}

export function saveLessonProgress(game: TrainingGame, step: number): void {
  write(`${game}:lesson`, step);
}

export const OPPONENT_NAMES = ['Bára', 'Cyril', 'Dana', 'Emil'];
export const LEVEL_LABELS: Record<AiLevel, string> = { 1: 'Začátečník', 2: 'Hráč', 3: 'Mistr' };
