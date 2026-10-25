import { describe, expect, it } from 'vitest';
import { adviseClovece, autoplayClovece, cloveceAiStep, threatsTo } from '../../../src/lib/games/clovece/ai.ts';
import {
  applyClovece,
  createCloveceGame,
  currentMoves,
  TRACK,
  withNextRoll,
  type AiLevel,
  type CloveceState,
} from '../../../src/lib/games/clovece/engine.ts';

function game(levels: AiLevel[], seed: number, settings = {}): CloveceState {
  return createCloveceGame({
    id: `g${seed}`,
    createdAt: '2026-10-25T10:00:00.000Z',
    seed,
    players: levels.map((ai, i) => ({ id: `ai${i + 1}`, name: `P${i + 1}`, ai })),
    settings,
  });
}

function position(pawns: number[][], value: number, settings = {}): CloveceState {
  const base = game([2, 2], 5, settings);
  const s = withNextRoll({ ...base, pawns, tries: 1 }, value);
  const r = applyClovece(s, { type: 'roll', by: { role: 'system' }, now: 0 });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('computer players', () => {
  it('play 200 seeded games to the end with legal moves only', () => {
    const levels: AiLevel[][] = [[1, 2], [2, 3, 1], [3, 3, 2, 1], [1, 1, 1, 1]];
    for (let seed = 1; seed <= 200; seed++) {
      const set = levels[seed % levels.length];
      const settings = seed % 5 === 0 ? { pawns: 2 as const } : seed % 7 === 0 ? { capture: false, enterOnOne: true } : {};
      let s = game(set, seed, settings);
      for (let n = 0; n < 20000 && s.phase === 'playing'; n++) {
        const before = s;
        s = cloveceAiStep(s, n);
        expect(s.seq).toBeGreaterThan(before.seq);
      }
      expect(s.phase).toBe('finished');
      expect(new Set(s.finished).size).toBe(set.length);
      expect(s.pawns.filter((p) => p.every((r) => r >= TRACK)).length).toBeGreaterThanOrEqual(set.length - 1);
    }
  });

  it('is deterministic for a seed', () => {
    const a = autoplayClovece(game([1, 2, 3], 42));
    const b = autoplayClovece(game([1, 2, 3], 42));
    expect(a.finished).toEqual(b.finished);
    expect(a.history).toEqual(b.history);
  });

  it('the stronger computer wins more often than the random one', () => {
    let wins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = autoplayClovece(game(seed % 2 ? [3, 1] : [1, 3], seed));
      const strong = seed % 2 ? 'ai1' : 'ai2';
      if (s.finished[0] === strong) wins += 1;
    }
    expect(wins).toBeGreaterThan(33);
  });
});

describe('heuristics', () => {
  it('captures when it can', () => {
    // Red on 22, green pawn on its relative 5 = field 25; a three hits it.
    const s = position([[22, 10, -1, -1], [5, -1, -1, -1]], 3);
    for (const level of [2, 3] as const) {
      const advice = adviseClovece(s, level);
      expect(advice.move?.captures).toEqual({ playerId: 'ai2', pawn: 0 });
      expect(advice.reason).toMatch(/Vyhoď/);
    }
  });

  it('goes home with an exact roll', () => {
    const s = position([[38, 5, -1, -1], [-1, -1, -1, -1]], 2);
    const advice = adviseClovece(s, 2);
    expect(advice.move?.to).toBe(40);
    expect(advice.reason).toMatch(/domečku/);
  });

  it('enters with a six when nothing better is on', () => {
    const s = position([[3, -1, -1, -1], [-1, -1, -1, -1]], 6);
    expect(adviseClovece(s, 2).move?.kind).toBe('enter');
  });

  it('runs away from an opponent right behind', () => {
    // Green pawn at field 22 (relative 2) is 3 behind red pawn at field 25; the other red pawn is safe.
    const s = position([[25, 3, -1, -1], [2, -1, -1, -1]], 5);
    expect(threatsTo(s, 0, 25)).toBe(1);
    const advice = adviseClovece(s, 3);
    expect(advice.move?.pawn).toBe(0);
    expect(advice.reason).toMatch(/Uteč/);
  });

  it('level 1 picks any legal move and says so', () => {
    const s = position([[3, 9, -1, -1], [-1, -1, -1, -1]], 6);
    const advice = adviseClovece(s, 1);
    expect(currentMoves(s).map((m) => m.pawn)).toContain(advice.move!.pawn);
  });

  it('advises a roll before the die is thrown', () => {
    expect(adviseClovece(game([2, 2], 3), 3)).toMatchObject({ command: { type: 'roll' }, move: null });
  });

  it('sees no danger when capturing is off', () => {
    const s = position([[25, 3, -1, -1], [2, -1, -1, -1]], 5, { capture: false });
    expect(threatsTo(s, 0, 25)).toBe(0);
  });
});
