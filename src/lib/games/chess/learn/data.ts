// Bundled lesson and puzzle data (data/chess/*.json).

import lessonsJson from '../../../../../data/chess/lessons.json';
import puzzlesJson from '../../../../../data/chess/puzzles.json';
import type { Lesson, LessonFile } from './lessons.ts';
import type { Puzzle, PuzzleFile } from './puzzles.ts';

export const LESSON_FILE = lessonsJson as unknown as LessonFile;
export const PUZZLE_FILE = puzzlesJson as unknown as PuzzleFile;

export const LESSONS: Lesson[] = LESSON_FILE.lessons;
export const PUZZLES: Puzzle[] = PUZZLE_FILE.puzzles;

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
