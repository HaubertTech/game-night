import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateAktivityFiles } from '../../../src/lib/games/aktivity/rules.ts';

const errors = (files: { path: string; content: unknown }[]) =>
  validateAktivityFiles(files.map((f) => ({ path: f.path, content: JSON.stringify(f.content) }))).issues.filter(
    (i) => i.severity === 'error',
  );

describe('validateAktivityFiles', () => {
  it('accepts a valid card', () => {
    expect(
      errors([{ path: 'lavice.json', content: [{ id: 'lavice-001', level: 'lavice', word: 'kolo', mode: 'any', difficulty: 3 }] }]),
    ).toEqual([]);
  });

  it('reports a bad id, a duplicate id and a duplicate word in a level', () => {
    const e = errors([
      {
        path: 'hospoda.json',
        content: [
          { id: 'hospoda-1', level: 'hospoda', word: 'kapr', mode: 'ukaz', difficulty: 3 },
          { id: 'hospoda-002', level: 'hospoda', word: 'Kapr', mode: 'ukaz', difficulty: 3 },
          { id: 'hospoda-002', level: 'hospoda', word: 'štika', mode: 'ukaz', difficulty: 3 },
        ],
      },
    ]).map((i) => i.message);
    expect(e.some((m) => m.includes('tvar'))).toBe(true);
    expect(e.some((m) => m.includes('Duplicitní id'))).toBe(true);
    expect(e.some((m) => m.includes('už je v úrovni'))).toBe(true);
  });

  it('requires an emoji and forbids „řekni“ for preschool', () => {
    const e = errors([
      { path: 'piskoviste.json', content: [{ id: 'piskoviste-001', level: 'piskoviste', word: 'pes', mode: 'rekni', difficulty: 3 }] },
    ]).map((i) => i.message);
    expect(e.some((m) => m.includes('image'))).toBe(true);
    expect(e.some((m) => m.includes('mode'))).toBe(true);
  });

  it('rejects the word itself among the forbidden words', () => {
    const e = errors([
      {
        path: 'hospoda.json',
        content: [{ id: 'hospoda-001', level: 'hospoda', word: 'Švejk', mode: 'rekni', difficulty: 4, forbidden: ['švejk'] }],
      },
    ]);
    expect(e).toHaveLength(1);
  });

  it('the shipped data has no errors and the expected size', () => {
    const dir = join(import.meta.dirname, '..', '..', '..', 'data', 'aktivity');
    const files = readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .map((n) => ({ path: n, content: readFileSync(join(dir, n), 'utf8') }));
    const report = validateAktivityFiles(files);
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    // Data agents add kocarek/prvnacek cards over time; the original decks must stay full.
    expect(report.counts.hospoda).toBeGreaterThanOrEqual(300);
    expect(report.counts.lavice).toBeGreaterThanOrEqual(200);
    expect(report.counts.piskoviste).toBeGreaterThanOrEqual(100);
  });
});
