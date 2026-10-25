// Deterministic question drawing for a whole game.

import type { Level, Question, Theme } from '../types.ts';
import { LEVEL_THEMES, hasOptions } from '../types.ts';
import { pickIndex, shuffle, type Rand } from './rng.ts';

/** A seat at the table: a single player or a team. A team plays at one level. */
export interface Contestant {
  id: string;
  name: string;
  avatar: string;
  level: Level;
  /** Player profile ids behind this seat (one for a player, several for a team). */
  memberIds: string[];
}

export interface Turn {
  contestantId: string;
  questionId: string;
  /** Shuffled options for choice and point questions (dataset order often hints the answer). */
  options?: string[];
  /** True when the question comes from another theme than the round (e.g. preschool mix). */
  fallback: boolean;
}

export interface DrawInput {
  themes: Theme[];
  contestants: Contestant[];
  questionsPerContestant: number;
  pool: Question[];
  /** Question ids each contestant has already seen in earlier games. */
  seen: Record<string, readonly string[]>;
  rand: Rand;
}

export interface DrawResult {
  rounds: { theme: Theme; turns: Turn[] }[];
  questions: Record<string, Question>;
  warnings: string[];
}

type Tier = (q: Question) => boolean;

/**
 * Picks one question for a contestant. Preference order:
 * 1. round theme, unseen
 * 2. any theme the level is meant to have (LEVEL_THEMES), unseen — e.g. "Mix Pískoviště"
 * 3. any theme of the level, unseen
 * 4. round theme, already seen
 * 5. anything of the level not used in this game
 */
function pickQuestion(
  levelPool: Question[],
  theme: Theme,
  level: Level,
  used: Set<string>,
  seen: Set<string>,
  rand: Rand,
): { question: Question; fallback: boolean } | null {
  const fresh = (q: Question) => !used.has(q.id) && !seen.has(q.id);
  const notUsed = (q: Question) => !used.has(q.id);
  const tiers: { test: Tier; fallback: boolean }[] = [
    { test: (q) => q.theme === theme && fresh(q), fallback: false },
  ];
  const levelThemes = LEVEL_THEMES[level];
  tiers.push({ test: (q) => levelThemes.includes(q.theme) && fresh(q), fallback: true });
  tiers.push(
    { test: fresh, fallback: true },
    { test: (q) => q.theme === theme && notUsed(q), fallback: false },
    { test: notUsed, fallback: true },
  );
  for (const tier of tiers) {
    const candidates = levelPool.filter(tier.test);
    if (candidates.length > 0) {
      return { question: candidates[pickIndex(candidates.length, rand)], fallback: tier.fallback };
    }
  }
  return null;
}

export function drawGame(input: DrawInput): DrawResult {
  const { themes, contestants, questionsPerContestant, pool, rand } = input;
  // Sorting by id makes the draw independent of the order in which files were loaded.
  const sortedPool = pool.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byLevel = new Map<Level, Question[]>();
  for (const q of sortedPool) {
    const list = byLevel.get(q.level) ?? [];
    list.push(q);
    byLevel.set(q.level, list);
  }

  const used = new Set<string>();
  const questions: Record<string, Question> = {};
  const warnings: string[] = [];
  const seenSets = new Map(contestants.map((c) => [c.id, new Set(input.seen[c.id] ?? [])]));

  const rounds = themes.map((theme, roundIndex) => {
    const n = contestants.length;
    // A different contestant starts each round.
    const order = contestants.map((_, i) => contestants[(i + roundIndex) % n]);
    const picks = new Map<string, Turn[]>();
    for (const c of order) {
      const levelPool = byLevel.get(c.level) ?? [];
      const turns: Turn[] = [];
      for (let k = 0; k < questionsPerContestant; k++) {
        const picked = pickQuestion(levelPool, theme, c.level, used, seenSets.get(c.id)!, rand);
        if (!picked) {
          warnings.push(`Pro ${c.name} (${c.level}) došly otázky v kole ${roundIndex + 1}.`);
          break;
        }
        const q = picked.question;
        used.add(q.id);
        questions[q.id] = q;
        turns.push({
          contestantId: c.id,
          questionId: q.id,
          options: hasOptions(q) ? shuffle(q.options, rand) : undefined,
          fallback: picked.fallback,
        });
      }
      picks.set(c.id, turns);
    }
    // Interleave: A1 B1 C1 A2 B2 C2 … so the tablet circles the table.
    const turns: Turn[] = [];
    for (let k = 0; k < questionsPerContestant; k++) {
      for (const c of order) {
        const t = picks.get(c.id)![k];
        if (t) turns.push(t);
      }
    }
    return { theme, turns };
  });

  return { rounds, questions, warnings };
}
