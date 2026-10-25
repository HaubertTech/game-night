// Shared contract between the dataset (data/questions/**) and the game engine.

/** From the youngest to adults (docs/UROVNE.md). The order drives fallbacks and mappings. */
export const LEVELS = ['kocarek', 'piskoviste', 'prvnacek', 'lavice', 'hospoda'] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  kocarek: 'Kočárek',
  piskoviste: 'Pískoviště',
  prvnacek: 'Prvňáček',
  lavice: 'Lavice',
  hospoda: 'Hospoda',
};

export const LEVEL_AGES: Record<Level, string> = {
  kocarek: '2–3 roky',
  piskoviste: '3,5–5 let',
  prvnacek: '6–7 let',
  lavice: '8–11 let',
  hospoda: 'dospělí',
};

/** Who reads the question: the parent (kocarek), the app aloud (TTS), or the player. */
export const LEVEL_READER: Record<Level, 'parent' | 'tts' | 'tts-button' | 'self'> = {
  kocarek: 'parent',
  piskoviste: 'tts',
  prvnacek: 'tts-button',
  lavice: 'self',
  hospoda: 'self',
};

/** Children's levels: pictures, children's hints in chess and cards. */
export const CHILD_LEVELS: readonly Level[] = ['kocarek', 'piskoviste', 'prvnacek'];

export function isChildLevel(level: Level): boolean {
  return CHILD_LEVELS.includes(level);
}

/** 0 = youngest. Unknown values rank as adults. */
export function levelRank(level: Level | string): number {
  const i = LEVELS.indexOf(level as Level);
  return i === -1 ? LEVELS.length - 1 : i;
}

/**
 * The closest level from `available` (ties go to the younger one: an easier question is better
 * than a too hard one). Returns null when `available` is empty.
 */
export function nearestLevel(level: Level, available: readonly Level[]): Level | null {
  if (available.includes(level)) return level;
  const r = levelRank(level);
  let best: Level | null = null;
  for (const l of available) {
    if (best === null) best = l;
    const d = Math.abs(levelRank(l) - r);
    const bd = Math.abs(levelRank(best) - r);
    if (d < bd || (d === bd && levelRank(l) < levelRank(best))) best = l;
  }
  return best;
}

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

/**
 * Themes each level has questions for (docs/UROVNE.md). When a round's theme is missing for a level,
 * the engine falls back to another theme of the same level.
 */
export const LEVEL_THEMES: Record<Level, readonly Theme[]> = {
  kocarek: ['priroda', 'veda-telo', 'jidlo', 'cisla-logika', 'sport-hry', 'pohadky-film-hudba'],
  piskoviste: ['priroda', 'cesko-svet', 'veda-telo', 'pohadky-film-hudba', 'sport-hry', 'jidlo', 'cisla-logika', 'slova-jazyk'],
  prvnacek: THEMES,
  lavice: THEMES,
  hospoda: THEMES,
};

/** @deprecated Use LEVEL_THEMES.piskoviste. */
export const PRESCHOOL_THEMES: readonly Theme[] = LEVEL_THEMES.piskoviste;

/** Question types each level may use. */
export const LEVEL_TYPES: Record<Level, readonly QuestionType[]> = {
  kocarek: ['point', 'imitate'],
  piskoviste: ['choice'],
  prvnacek: ['choice'],
  lavice: ['choice'],
  hospoda: ['choice', 'estimate', 'open'],
};

export const QUESTION_TYPES = ['choice', 'estimate', 'open', 'point', 'imitate'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

interface QuestionBase {
  /** `<level>-<theme>-<NNN>`, e.g. `hospoda-priroda-007` */
  id: string;
  level: Level;
  theme: Theme;
  text: string;
  /** Short fun fact shown after the answer. */
  fact: string;
  difficulty: 1 | 2 | 3;
  /** Big emoji or art key shown above the question (mandatory for kocarek, piskoviste, prvnacek). */
  image?: string;
  /** URL or short note where the fact can be verified. */
  source?: string;
  status: 'verified' | 'draft';
}

export interface ChoiceQuestion extends QuestionBase {
  type: 'choice';
  /** 2–4 options; children's options start with an emoji, e.g. "🦔 Ježek". */
  options: string[];
  /** Must equal one of `options` exactly. */
  answer: string;
}

export interface EstimateQuestion extends QuestionBase {
  type: 'estimate';
  answer: number;
  unit: string;
  /** Absolute tolerance (1 point within `partial`; within `full` it is praised as precise). Without it, years use
   * YEAR_TOLERANCE and everything else a relative tolerance (10 % / 25 %). */
  tolerance?: { full: number; partial: number };
}

export const YEAR_TOLERANCE = { full: 3, partial: 10 } as const;

export interface OpenQuestion extends QuestionBase {
  type: 'open';
  answer: string;
  /** Other accepted spellings. */
  accept?: string[];
}

/** „Ukaž pejska.“ — the child taps (or points at) a picture. Scored like a choice question. */
export interface PointQuestion extends QuestionBase {
  type: 'point';
  /** 2–4 picture options, each starting with an emoji ("🐶 Pejsek"). */
  options: string[];
  /** Must equal one of `options` exactly. */
  answer: string;
}

/** „Jak dělá koza?“ — the child imitates a sound or a move, the parent confirms ✓/✗. */
export interface ImitateQuestion extends QuestionBase {
  type: 'imitate';
  /** Model answer for the parent („Mééé“). */
  answer: string;
}

export type Question = ChoiceQuestion | EstimateQuestion | OpenQuestion | PointQuestion | ImitateQuestion;

/** Questions answered by tapping one of `options`. */
export type OptionQuestion = ChoiceQuestion | PointQuestion;

export function hasOptions(q: Question): q is OptionQuestion {
  return q.type === 'choice' || q.type === 'point';
}

/** Questions a person judges ✓/✗ after seeing the model answer. */
export function isJudged(q: Question): q is OpenQuestion | ImitateQuestion {
  return q.type === 'open' || q.type === 'imitate';
}
