import { describe, expect, it } from 'vitest';
import { applyClovece, currentMoves, YARD } from '../../../src/lib/games/clovece/engine.ts';
import { LESSON_STEPS, lessonState, OPPONENT, YOU } from '../../../src/lib/games/clovece/lessons.ts';

describe('owl lesson', () => {
  it('covers the die, entering, moving, capturing and the home', () => {
    expect(LESSON_STEPS.map((s) => s.id)).toEqual(['kostka', 'nasazeni', 'pohyb', 'vyhozeni', 'domecek']);
  });

  for (const step of LESSON_STEPS) {
    it(`step „${step.title}“ plays as the owl says`, () => {
      let s = lessonState(step);
      const rolled = applyClovece(s, { type: 'roll', by: { role: 'contestant', contestantId: YOU }, now: 0 });
      expect(rolled.ok).toBe(true);
      s = rolled.ok ? rolled.state : s;
      expect(s.dice).toBe(step.roll);
      if (step.pawn === null) {
        expect(currentMoves(s)).toEqual([]);
        expect(s.turn).toBe(YOU);
        return;
      }
      expect(currentMoves(s).map((m) => m.pawn)).toContain(step.pawn);
      const moved = applyClovece(s, { type: 'move', pawn: step.pawn, by: { role: 'contestant', contestantId: YOU }, now: 0 });
      expect(moved.ok).toBe(true);
      if (!moved.ok) return;
      const after = moved.state;
      if (step.id === 'nasazeni') expect(after.pawns[0][0]).toBe(0);
      if (step.id === 'pohyb') expect(after.pawns[0][0]).toBe(4);
      if (step.id === 'vyhozeni') expect(after.pawns[1][0]).toBe(YARD);
      if (step.id === 'domecek') expect(after.finished[0]).toBe(YOU);
      expect(after.players.map((p) => p.id)).toEqual([YOU, OPPONENT]);
    });
  }
});
