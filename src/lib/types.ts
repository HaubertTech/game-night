// Shared contract between the dataset (data/questions/**) and the game engine.

export const LEVELS = ['hospoda', 'lavice', 'piskoviste'] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  hospoda: 'Hospoda',
  lavice: 'Lavice',
  piskoviste: 'Pískoviště',
};

export const THEMES = [
  'priroda',
  'cesko-svet',
  'veda-telo',
  'pohadky-film-hudba',
  'sport-hry',
  'jidlo',
  'cisla-logika',
  'slova-jazyk',
  'dejiny',
] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  priroda: 'Příroda a zvířata',
  'cesko-svet': 'Česko a svět',
  'veda-telo': 'Lidé, tělo a věda',
  'pohadky-film-hudba': 'Pohádky, film a hudba',
  'sport-hry': 'Sport a hry',
  jidlo: 'Jídlo a pití',
  'cisla-logika': 'Čísla a logika',
  'slova-jazyk': 'Slova a jazyk',
  dejiny: 'Dějiny a vynálezy',
};

/** Preschool has no questions for these themes; the engine falls back to any other preschool theme. */
export const PRESCHOOL_THEMES: readonly Theme[] = [
  'priroda',
  'cesko-svet',
  'veda-telo',
  'pohadky-film-hudba',
  'sport-hry',
  'jidlo',
  'cisla-logika',
];

interface QuestionBase {
  /** `<level>-<theme>-<NNN>`, e.g. `hospoda-priroda-007` */
  id: string;
  level: Level;
  theme: Theme;
  text: string;
  /** Short fun fact shown after the answer. */
  fact: string;
  difficulty: 1 | 2 | 3;
  /** Optional big emoji shown above the question (mandatory for piskoviste). */
  image?: string;
  /** URL or short note where the fact can be verified. */
  source?: string;
  status: 'verified' | 'draft';
}

export interface ChoiceQuestion extends QuestionBase {
  type: 'choice';
  /** 2–4 options; piskoviste options start with an emoji, e.g. "🦔 Ježek". */
  options: string[];
  /** Must equal one of `options` exactly. */
  answer: string;
}

export interface EstimateQuestion extends QuestionBase {
  type: 'estimate';
  answer: number;
  unit: string;
}

export interface OpenQuestion extends QuestionBase {
  type: 'open';
  answer: string;
  /** Other accepted spellings. */
  accept?: string[];
}

export type Question = ChoiceQuestion | EstimateQuestion | OpenQuestion;
