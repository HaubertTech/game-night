// Shared contract between the dataset (data/aktivity/*.json) and the game engine of
// „Řekni, ukaž, nakresli“.

import { LEVELS, nearestLevel, type Level } from '../../types.ts';

/** How the word is explained: describe it, act it out, draw it. */
export const AKTIVITY_MODES = ['rekni', 'ukaz', 'nakresli'] as const;
export type AktivityMode = (typeof AKTIVITY_MODES)[number];
/** A card may leave the mode open; the engine then picks one when the card is drawn. */
export type CardMode = AktivityMode | 'any';

export const AKTIVITY_MODE_LABELS: Record<AktivityMode, string> = {
  rekni: 'Řekni',
  ukaz: 'Ukaž',
  nakresli: 'Nakresli',
};

export const DIFFICULTIES = [3, 4, 5] as const;
/** Difficulty doubles as the points for a guessed word. */
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Preschoolers do not read and cannot describe a word they only see as a picture. */
export const PRESCHOOL_MODES: readonly AktivityMode[] = ['ukaz', 'nakresli'];

export interface AktivityCard {
  /** `<level>-NNN`, e.g. `hospoda-042` */
  id: string;
  level: Level;
  word: string;
  mode: CardMode;
  difficulty: Difficulty;
  /** Big emoji shown with the word (mandatory for piskoviste: the child sees the picture). */
  image?: string;
  /** Words the explainer must not say in „řekni“ (hospoda). */
  forbidden?: string[];
}

/** Levels that only act out and draw (they do not read; an adult whispers the word). */
export const PRESCHOOL_LEVELS: readonly Level[] = ['kocarek', 'piskoviste'];

/** Modes allowed for an explainer of the given level. */
export function modesForLevel(level: Level): readonly AktivityMode[] {
  return PRESCHOOL_LEVELS.includes(level) ? PRESCHOOL_MODES : AKTIVITY_MODES;
}

/**
 * Which level's cards a player draws: their own when the dataset has them, otherwise the nearest
 * level (kocarek → piskoviste with a parent's help; prvnacek → piskoviste/lavice until it has its own).
 */
export function cardLevelFor(level: Level, available: readonly Level[]): Level {
  return nearestLevel(level, LEVELS.filter((l) => available.includes(l))) ?? level;
}
