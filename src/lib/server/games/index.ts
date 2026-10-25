// Game adapters of live rooms by game id.

import type { RoomGame } from '../../live/games.ts';
import { aktivityAdapter } from './aktivity.ts';
import { mjzAdapter } from './mjz.ts';
import { quizAdapter } from './quiz.ts';
import type { GameAdapter } from './types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAdapter = GameAdapter<any, any>;

export const GAME_ADAPTERS: Record<RoomGame, AnyAdapter> = {
  quiz: quizAdapter,
  aktivity: aktivityAdapter,
  mjz: mjzAdapter,
};

/** Rooms stored before v2 have no `game`: they are quiz rooms. */
export function adapterFor(game: RoomGame | undefined): AnyAdapter {
  return GAME_ADAPTERS[game ?? 'quiz'];
}
