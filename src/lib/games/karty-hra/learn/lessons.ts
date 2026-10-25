// Learning mode: lessons (data/karty-hra/lessons-*.json) are a list of steps; a step either
// explains something or asks the child to try it. Every task is checked by the real game rules
// (prsi-engine.ts, zoliky-melds.ts), so the lesson can never teach something the game refuses.

import prsiLesson from '../../../../../data/karty-hra/lessons-prsi.json' with { type: 'json' };
import zolikyLesson from '../../../../../data/karty-hra/lessons-zoliky.json' with { type: 'json' };
import { mariasCard, type MariasCardId, type MariasSuit } from '../cards.ts';
import { createPrsiGame, explainCard, playableCards, type PrsiGameState } from '../prsi-engine.ts';
import {
  MELD_ERROR_TEXT,
  analyzeMeld,
  checkOpening,
  handPoints,
  isPureRun,
  layOff,
  type MeldShape,
} from '../zoliky-melds.ts';

export type OwlPose = 'mava' | 'otazka' | 'slavi' | 'premysli';
export type Audience = 'kid' | 'adult';

export type LessonTask =
  | { type: 'pickPrsi'; top: string; suit?: MariasSuit; pendingSevens?: number; pendingAce?: boolean; hand: string[] }
  | { type: 'choice'; question: string; options: { text: string; correct?: boolean; why?: string }[] }
  | { type: 'buildMeld'; hand: string[]; kind: 'run' | 'group' | 'any'; requireJoker?: boolean }
  | { type: 'opening'; hand: string[]; min: number }
  | { type: 'layOff'; meld: string[]; hand: string[] }
  | { type: 'pickCard'; hand: string[]; correct: string[]; why: string; wrong: string }
  | { type: 'count'; cards: string[]; options: number[] };

export interface LessonStep {
  id: string;
  title: string;
  pose: OwlPose;
  /** Text for children (6–11). */
  text: string;
  /** Shorter text for adults; falls back to `text`. */
  textAdult?: string;
  /** Cards to show next to the text. */
  show?: string[];
  task?: LessonTask;
  /** What the owl says after a correct answer. */
  success?: string;
}

export interface Lesson {
  id: 'prsi' | 'zoliky';
  title: string;
  /** Short rules overview, shown any time during a game. */
  rules: string[];
  steps: LessonStep[];
}

export const LESSONS: Record<Lesson['id'], Lesson> = {
  prsi: prsiLesson as Lesson,
  zoliky: zolikyLesson as Lesson,
};

export function stepText(step: LessonStep, audience: Audience): string {
  return audience === 'adult' && step.textAdult ? step.textAdult : step.text;
}

export interface TaskCheck {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------------------------
// Prší tasks

/** A two-player table with the task's cards: "ja" holds the hand and is on turn. */
export function prsiTaskState(task: Extract<LessonTask, { type: 'pickPrsi' }>): PrsiGameState {
  const base = createPrsiGame({
    id: 'lekce',
    createdAt: '2026-01-01T00:00:00.000Z',
    seed: 1,
    players: [
      { id: 'ja', name: 'Ty' },
      { id: 'sova', name: 'Sova' },
    ],
  });
  const top = task.top as MariasCardId;
  return {
    ...base,
    hands: { ja: task.hand as MariasCardId[], sova: ['srdce-8', 'listy-8', 'kule-8'] },
    discard: [top],
    suit: task.suit ?? mariasCard(top).suit,
    pendingSevens: task.pendingSevens ?? 0,
    pendingAce: task.pendingAce ?? false,
    turn: 'ja',
  };
}

export function prsiTaskAnswers(task: Extract<LessonTask, { type: 'pickPrsi' }>): string[] {
  return playableCards(prsiTaskState(task), 'ja');
}

export function checkPrsiPick(task: Extract<LessonTask, { type: 'pickPrsi' }>, cardId: string): TaskCheck {
  const state = prsiTaskState(task);
  const ok = playableCards(state, 'ja').includes(cardId as MariasCardId);
  return { ok, message: explainCard(state, 'ja', cardId) };
}

// ---------------------------------------------------------------------------------------------
// Žolíky tasks

export function checkBuildMeld(task: Extract<LessonTask, { type: 'buildMeld' }>, selected: string[]): TaskCheck {
  const check = analyzeMeld(selected);
  if (!check.ok) return { ok: false, message: MELD_ERROR_TEXT[check.error] };
  if (task.kind === 'run' && check.shape.kind !== 'run') return { ok: false, message: 'Tohle je trojice. Teď hledáme postupku — karty po sobě v jedné barvě.' };
  if (task.kind === 'group' && check.shape.kind !== 'group') return { ok: false, message: 'Tohle je postupka. Teď hledáme trojici — stejné číslo v různých barvách.' };
  if (task.requireJoker && !check.shape.slots.some((s) => s.joker)) return { ok: false, message: 'Skupina platí, ale zkus do ní zapojit žolíka.' };
  return { ok: true, message: describeShape(check.shape) };
}

function describeShape(shape: MeldShape): string {
  const joker = shape.slots.some((s) => s.joker) ? ' Žolík v ní zastupuje chybějící kartu.' : '';
  return shape.kind === 'run' ? `Výborně, to je postupka!${joker}` : `Výborně, to je ${shape.slots.length === 4 ? 'čtveřice' : 'trojice'}!${joker}`;
}

export function checkOpeningTask(task: Extract<LessonTask, { type: 'opening' }>, groups: string[][]): TaskCheck {
  const check = checkOpening(groups, { min: task.min, requirePureRun: true });
  if (!check.ok) return { ok: false, message: check.reason ?? 'Ještě to nestačí.' };
  return { ok: true, message: `Paráda! Máš ${check.points} bodů a čistou postupku — můžeš vyložit.` };
}

export function checkLayOffTask(task: Extract<LessonTask, { type: 'layOff' }>, cardId: string): TaskCheck {
  const meld = analyzeMeld(task.meld);
  if (!meld.ok) return { ok: false, message: 'Skupina v lekci je špatně.' };
  const r = layOff(meld.shape, [cardId]);
  if (!r.ok) return { ok: false, message: MELD_ERROR_TEXT[r.error] };
  return { ok: true, message: 'Ano! Karta navazuje na skupinu, tak ji můžeš přiložit.' };
}

export function checkPickCard(task: Extract<LessonTask, { type: 'pickCard' }>, cardId: string): TaskCheck {
  const ok = task.correct.includes(cardId);
  return { ok, message: ok ? task.why : task.wrong };
}

export function countAnswer(task: Extract<LessonTask, { type: 'count' }>): number {
  return handPoints(task.cards);
}

export function checkCount(task: Extract<LessonTask, { type: 'count' }>, value: number): TaskCheck {
  const answer = countAnswer(task);
  return value === answer
    ? { ok: true, message: `Správně, je to ${answer} bodů.` }
    : { ok: false, message: 'Ještě jednou: obrázky a eso mají po 10, žolík 50, ostatní karty kolik ukazují.' };
}

export function checkChoice(task: Extract<LessonTask, { type: 'choice' }>, index: number): TaskCheck {
  const option = task.options[index];
  if (!option) return { ok: false, message: 'Vyber jednu možnost.' };
  return { ok: !!option.correct, message: option.why ?? (option.correct ? 'Správně!' : 'Tohle ne, zkus to znovu.') };
}

/** Is every task of the lesson solvable (used by the tests and when editing the JSON)? */
export function lessonProblems(lesson: Lesson): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const step of lesson.steps) {
    if (ids.has(step.id)) problems.push(`${step.id}: duplicate id`);
    ids.add(step.id);
    const t = step.task;
    if (!t) continue;
    switch (t.type) {
      case 'pickPrsi': {
        const answers = prsiTaskAnswers(t);
        if (answers.length === 0) problems.push(`${step.id}: no playable card`);
        if (answers.length === t.hand.length) problems.push(`${step.id}: every card is playable`);
        break;
      }
      case 'choice':
        if (t.options.filter((o) => o.correct).length !== 1) problems.push(`${step.id}: needs exactly one correct option`);
        break;
      case 'buildMeld': {
        const any = subsets(t.hand).some((s) => checkBuildMeld(t, s).ok);
        if (!any) problems.push(`${step.id}: no valid combination`);
        break;
      }
      case 'opening': {
        const groups = subsets(t.hand).filter((s) => analyzeMeld(s).ok);
        const pure = groups.filter((g) => {
          const a = analyzeMeld(g);
          return a.ok && isPureRun(a.shape);
        });
        const solvable = pure.some((p) => groups.some((g) => !g.some((id) => p.includes(id)) && checkOpening([p, g], { min: t.min, requirePureRun: true }).ok) || checkOpening([p], { min: t.min, requirePureRun: true }).ok);
        if (!solvable) problems.push(`${step.id}: opening not reachable`);
        break;
      }
      case 'layOff':
        if (!t.hand.some((id) => checkLayOffTask(t, id).ok)) problems.push(`${step.id}: nothing to lay off`);
        if (t.hand.every((id) => checkLayOffTask(t, id).ok)) problems.push(`${step.id}: every card fits`);
        break;
      case 'pickCard':
        if (!t.correct.length || !t.correct.every((id) => t.hand.includes(id))) problems.push(`${step.id}: correct card not in hand`);
        break;
      case 'count':
        if (!t.options.includes(countAnswer(t))) problems.push(`${step.id}: answer ${countAnswer(t)} not among options`);
        break;
    }
  }
  return problems;
}

function subsets(hand: string[]): string[][] {
  const out: string[][] = [];
  for (let mask = 1; mask < 1 << hand.length; mask++) {
    const s = hand.filter((_, i) => mask & (1 << i));
    if (s.length >= 3) out.push(s);
  }
  return out;
}
