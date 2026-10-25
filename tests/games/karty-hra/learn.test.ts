import { describe, expect, it } from 'vitest';
import { isFrenchCardId, isMariasCardId } from '../../../src/lib/games/karty-hra/cards.ts';
import {
  LESSONS,
  checkBuildMeld,
  checkCount,
  checkOpeningTask,
  checkPrsiPick,
  lessonProblems,
  type LessonTask,
} from '../../../src/lib/games/karty-hra/learn/lessons.ts';

function task<T extends LessonTask['type']>(lesson: 'prsi' | 'zoliky', id: string): Extract<LessonTask, { type: T }> {
  const step = LESSONS[lesson].steps.find((s) => s.id === id);
  if (!step?.task) throw new Error(`missing ${id}`);
  return step.task as Extract<LessonTask, { type: T }>;
}

describe('výukový mód — lekce', () => {
  it('every lesson task is solvable by the real rules', () => {
    expect(lessonProblems(LESSONS.prsi)).toEqual([]);
    expect(lessonProblems(LESSONS.zoliky)).toEqual([]);
  });

  it('lessons use valid cards of the right deck', () => {
    const prsiCards = LESSONS.prsi.steps.flatMap((s) => [...(s.show ?? []), ...(s.task && 'hand' in s.task ? s.task.hand : [])]);
    expect(prsiCards.every((c) => isMariasCardId(c))).toBe(true);
    const zolikyCards = LESSONS.zoliky.steps.flatMap((s) => [...(s.show ?? []), ...(s.task && 'hand' in s.task ? s.task.hand : [])]);
    expect(zolikyCards.every((c) => isFrenchCardId(c))).toBe(true);
  });

  it('cover the topics: sedma, eso, svršek, vítězství; postupka, trojice, žolík, 42, přikládání, zavření, body', () => {
    const p = LESSONS.prsi.steps.map((s) => s.id);
    for (const id of ['barvy', 'hodnoty', 'barva', 'sedma', 'eso', 'svrsek', 'vitez']) expect(p).toContain(id);
    const z = LESSONS.zoliky.steps.map((s) => s.id);
    for (const id of ['postupka', 'trojice', 'zolik', 'prvni', 'prikladani', 'odhazovani', 'zavreni', 'pocitani']) expect(z).toContain(id);
  });
});

describe('výukový mód — kontrola úkolů', () => {
  it('prší: a wrong card is explained', () => {
    const t = task<'pickPrsi'>('prsi', 'barva');
    expect(checkPrsiPick(t, 'srdce-kral').ok).toBe(true);
    const wrong = checkPrsiPick(t, 'kule-10');
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toMatch(/barvu ani hodnotu/);
  });

  it('prší: on an active seven only a seven is right', () => {
    const t = task<'pickPrsi'>('prsi', 'sedma');
    expect(checkPrsiPick(t, 'srdce-7').ok).toBe(true);
    expect(checkPrsiPick(t, 'kule-9').message).toMatch(/sedm/);
  });

  it('žolíky: run, group and joker tasks', () => {
    expect(checkBuildMeld(task('zoliky', 'postupka'), ['srdce-4-0', 'srdce-5-0', 'srdce-6-0']).ok).toBe(true);
    expect(checkBuildMeld(task('zoliky', 'postupka'), ['srdce-4-0', 'kary-5-0', 'srdce-6-0']).ok).toBe(false);
    expect(checkBuildMeld(task('zoliky', 'zolik'), ['krize-7-0', 'krize-9-0']).ok).toBe(false);
    expect(checkBuildMeld(task('zoliky', 'zolik'), ['krize-7-0', 'zolik-0', 'krize-9-0']).ok).toBe(true);
  });

  it('žolíky: the first lay-down needs 42 points', () => {
    const t = task<'opening'>('zoliky', 'prvni');
    expect(checkOpeningTask(t, [['srdce-11-0', 'srdce-12-0', 'srdce-13-0']]).message).toMatch(/42/);
    expect(checkOpeningTask(t, [['srdce-11-0', 'srdce-12-0', 'srdce-13-0'], ['kary-4-0', 'piky-4-0', 'krize-4-0']]).ok).toBe(true);
  });

  it('žolíky: counting points in hand', () => {
    expect(checkCount(task('zoliky', 'pocitani'), 75).ok).toBe(true);
    expect(checkCount(task('zoliky', 'pocitani'), 65).ok).toBe(false);
  });
});
