// The owl's lesson of Člověče, nezlob se: short steps on a real board, each with one thing to do
// (roll, or tap a pawn). Every step is a real engine state with a prepared die, so the lesson
// teaches exactly the rules the game plays by (tests/games/clovece/lessons.test.ts checks it).

import { createCloveceGame, withNextRoll, type CloveceSettings, type CloveceState } from './engine.ts';

export interface LessonStep {
  id: string;
  title: string;
  /** What the owl says before the child acts. */
  intro: string;
  /** Pawns of [you (red), opponent (green)] at the start of the step. */
  pawns: [number[], number[]];
  /** The die the child will roll. */
  roll: number;
  /** After rolling: tap this pawn (null = the roll itself is the lesson). */
  pawn: number | null;
  /** What the owl says when it is done. */
  outro: string;
  settings?: Partial<CloveceSettings>;
}

export const YOU = 'ty';
export const OPPONENT = 'soupeř';

export const LESSON_STEPS: LessonStep[] = [
  {
    id: 'kostka',
    title: 'Kostka',
    intro: 'Všechny tvoje figurky čekají ve startovním domečku v rohu. Ťukni na kostku a hoď!',
    pawns: [[-1, -1, -1, -1], [-1, -1, -1, -1]],
    roll: 3,
    pawn: null,
    outro: 'Padla trojka. Dokud nemáš žádnou figurku na plánu, potřebuješ šestku — a zkoušíš to až třikrát.',
  },
  {
    id: 'nasazeni',
    title: 'Nasazení',
    intro: 'Zkus to znovu. Až padne šestka, ťukni na figurku, která svítí.',
    pawns: [[-1, -1, -1, -1], [-1, -1, -1, -1]],
    roll: 6,
    pawn: 0,
    outro: 'Výborně! Šestka postavila figurku na start — pole se šipkou tvojí barvy. Po šestce se hází ještě jednou.',
  },
  {
    id: 'pohyb',
    title: 'Pohyb',
    intro: 'Figurka chodí po kroužcích ve směru šipky. Hoď a posuň ji — počítej se mnou.',
    pawns: [[0, -1, -1, -1], [-1, -1, -1, -1]],
    roll: 4,
    pawn: 0,
    outro: 'Jedna, dvě, tři, čtyři! Figurka šla přesně o tolik polí, kolik ukázala kostka.',
  },
  {
    id: 'vyhozeni',
    title: 'Vyhození',
    intro: 'Kousek před tebou stojí soupeřova zelená figurka. Hoď a zkus na ni doskočit.',
    // Green relative 33 = field 13, red relative 10 = field 10: a three hits it.
    pawns: [[10, -1, -1, -1], [33, -1, -1, -1]],
    roll: 3,
    pawn: 0,
    outro: 'Bum! Soupeřova figurka se musí vrátit do svého domečku a znovu čekat na šestku. Proto se hra jmenuje Člověče, nezlob se!',
  },
  {
    id: 'domecek',
    title: 'Domeček',
    intro: 'Figurka oběhla celý plán. Do cílového domečku uprostřed se musí trefit přesně. Hoď!',
    pawns: [[37, 43], [-1, -1]],
    roll: 5,
    pawn: 0,
    outro: 'Hurá, obě figurky jsou doma! Kdo první dostane domů všechny, vyhrál — ostatní hrají dál o další místa.',
    settings: { pawns: 2 },
  },
];

/** Engine state of a step: you are on turn, the next roll is the step's die. */
export function lessonState(step: LessonStep): CloveceState {
  const base = createCloveceGame({
    id: `lekce-${step.id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    seed: 1,
    settings: { ...step.settings },
    players: [
      { id: YOU, name: 'Ty', ai: null },
      { id: OPPONENT, name: 'Soupeř', ai: null },
    ],
  });
  const pawns = step.pawns.map((p) => [...p]);
  const onRing = pawns[0].some((r) => r >= 0 && r < 40);
  return withNextRoll({ ...base, pawns, tries: onRing ? 1 : 3 }, step.roll);
}
