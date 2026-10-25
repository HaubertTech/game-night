// Browser persistence of Člověče, nezlob se on the tablet: the running game with the helpers of
// each seat, and the last setup. Broken or old data is ignored.

import type { AiLevel, CloveceSettings, CloveceState } from '../../games/clovece/engine.ts';
import type { Level } from '../../types.ts';

const GAME_KEY = 'domaci-liga:clovece:game';
const SETUP_KEY = 'domaci-liga:clovece:setup';

export interface SeatHelp {
  /** Owl explains, highlights and offers „Poraď“. */
  hints: boolean;
  /** Steps are counted aloud (TTS). */
  speak: boolean;
}

export interface SavedGame {
  state: CloveceState;
  help: Record<string, SeatHelp>;
  /** Every person is a household player: the finished game goes to the league. */
  league: boolean;
  nightId: number | null;
  /** League match id once recorded. */
  matchId: number | null;
}

export interface SetupSeat {
  id: string;
  name: string;
  avatar: string;
  level: Level;
  ai: AiLevel | null;
  hints: boolean;
  speak: boolean;
}

export interface SavedSetup {
  people: string[];
  guests: { id: string; name: string; level: Level }[];
  computers: number;
  level: AiLevel;
  settings: CloveceSettings;
  help: Record<string, SeatHelp>;
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the game just is not remembered.
  }
}

export function loadGame(): SavedGame | null {
  const g = read<SavedGame>(GAME_KEY);
  return g && g.state?.game === 'clovece' && g.state.v === 1 ? g : null;
}

export const saveGame = (g: SavedGame | null) => write(GAME_KEY, g);
export const loadSetup = () => read<SavedSetup>(SETUP_KEY);
export const saveSetup = (s: SavedSetup) => write(SETUP_KEY, s);

/** League player id behind a seat (`p12` → 12), null for guests and computers. */
export function leaguePlayerId(id: string): number | null {
  const m = /^p(\d{1,15})$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** Children get the owl's help by default; the youngest also hear the counting. */
export function defaultHelp(level: Level): SeatHelp {
  return { hints: level !== 'hospoda', speak: level !== 'hospoda' && level !== 'lavice' };
}
