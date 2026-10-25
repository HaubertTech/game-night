import { describe, expect, it } from 'vitest';
import { fanLayout } from '../../../src/lib/ui/karty-hra/fan-layout.ts';

function minVisible(l: ReturnType<typeof fanLayout>): number {
  // Smallest horizontal gap between neighbours in the same row.
  let min = Infinity;
  for (let i = 1; i < l.slots.length; i++) {
    if (l.slots[i].y === l.slots[i - 1].y) min = Math.min(min, l.slots[i].x - l.slots[i - 1].x);
  }
  return min;
}

describe('fanLayout', () => {
  it('keeps a small hand in one row', () => {
    const l = fanLayout(5, 330);
    expect(l.rows).toBe(1);
    expect(l.slots).toHaveLength(5);
  });

  it('breaks 16 cards on a narrow phone into two readable rows', () => {
    for (const width of [328, 358]) {
      const l = fanLayout(16, width);
      expect(l.rows).toBe(2);
      expect(l.slots).toHaveLength(16);
      expect(minVisible(l)).toBeGreaterThanOrEqual(l.cardWidth * 0.4);
      expect(l.width).toBeLessThanOrEqual(width);
    }
  });

  it('keeps 16 cards in one row on a tablet', () => {
    const l = fanLayout(16, 1000);
    expect(l.rows).toBe(1);
    expect(l.width).toBeLessThanOrEqual(1000);
  });

  it('handles an empty hand and a single card', () => {
    expect(fanLayout(0, 300).slots).toEqual([]);
    expect(fanLayout(1, 300).slots).toHaveLength(1);
  });
});
