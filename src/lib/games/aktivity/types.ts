// Shared contract between the dataset (data/aktivity/*.json) and the game engine of
// „Řekni, ukaž, nakresli“.

import type { Level } from '../../types.ts';

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

/** Modes allowed for an explainer of the given level. */
export function modesForLevel(level: Level): readonly AktivityMode[] {
  return level === 'piskoviste' ? PRESCHOOL_MODES : AKTIVITY_MODES;
}
