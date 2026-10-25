import { describe, expect, it } from 'vitest';
import { ADULT_CATEGORIES, KIDS_CATEGORIES, alphabet } from '../../../src/lib/games/mjz/engine.ts';
import { buildHintIndex, isKnownAnswer } from '../../../src/lib/games/mjz/hints.ts';
import { hintFiles, loadHintIndex } from '../../../src/lib/games/mjz/hints-data.ts';
import { viewFor } from '../../../src/lib/games/mjz/view.ts';
import { applyMjz, createMjzGame, type MjzState } from '../../../src/lib/games/mjz/engine.ts';

const cat = (id: string) => ADULT_CATEGORIES.find((c) => c.id === id);

describe('mjz hints: data files', () => {
  const files = hintFiles();

  it('has a file for every hint key the categories use', () => {
    const keys = new Set(files.map((f) => f.key));
    for (const c of [...ADULT_CATEGORIES, ...KIDS_CATEGORIES]) for (const k of c.hints ?? []) expect(keys).toContain(k);
  });

  it('files the words under their initial letter, without duplicates', () => {
    for (const f of files) {
      const all = Object.values(f.byLetter).flat();
      expect(new Set(all).size, f.key).toBe(all.length);
      for (const [letter, words] of Object.entries(f.byLetter)) {
        for (const w of words) {
          const initial = w.slice(0, 2).toLowerCase() === 'ch' ? 'Ch' : w[0].toUpperCase();
          expect(initial, `${f.key}: ${w}`).toBe(letter);
        }
      }
    }
  });

  it('has a reasonable size', () => {
    const size = (key: string) => Object.values(files.find((f) => f.key === key)!.byLetter).flat().length;
    expect(size('mesta')).toBeGreaterThanOrEqual(400);
    expect(size('jmena')).toBeGreaterThanOrEqual(360);
    expect(size('zvirata')).toBeGreaterThanOrEqual(300);
    expect(size('rostliny')).toBeGreaterThanOrEqual(250);
    expect(size('reky') + size('hory')).toBeGreaterThanOrEqual(150);
  });

  it('covers most playable letters for cities', () => {
    const mesta = files.find((f) => f.key === 'mesta')!;
    const covered = alphabet(true).filter((l) => mesta.byLetter[l]?.length);
    expect(covered.length).toBeGreaterThanOrEqual(20);
  });
});

describe('mjz hints: lookup', () => {
  const index = buildHintIndex([{ key: 'mesta', label: 'Města', source: 'test', byLetter: { 'Ú': ['Ústí nad Labem'], P: ['Praha'] } }]);

  it('matches regardless of diacritics and case', () => {
    expect(isKnownAnswer(index, cat('mesto'), 'usti nad labem')).toBe(true);
    expect(isKnownAnswer(index, cat('mesto'), 'Pardubice')).toBe(false);
  });

  it('returns null for categories without hints', () => {
    expect(isKnownAnswer(index, cat('vec'), 'Pračka')).toBeNull();
    expect(isKnownAnswer(undefined, cat('mesto'), 'Praha')).toBeNull();
  });

  it('marks known answers in the review view', () => {
    const players = [
      { id: 'a', name: 'A', avatar: 'x', level: 'hospoda' as const, memberIds: ['a'] },
      { id: 'b', name: 'B', avatar: 'y', level: 'hospoda' as const, memberIds: ['b'] },
    ];
    let s: MjzState = createMjzGame({ seed: 3, contestants: players, settings: { categories: [cat('mesto')!, cat('vec')!] } });
    const step = (cmd: Parameters<typeof applyMjz>[1]) => {
      const r = applyMjz(s, cmd);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    };
    step({ type: 'start', by: { role: 'host' }, now: 0 });
    while (s.letter !== 'P') step({ type: 'redraw', by: { role: 'host' }, now: 0 });
    step({ type: 'startWriting', by: { role: 'host' }, now: 0 });
    step({ type: 'write', answers: { mesto: 'Praha', vec: 'Pero' }, by: { role: 'contestant', contestantId: 'a' }, now: 1 });
    step({ type: 'write', answers: { mesto: 'Prdelákov' }, by: { role: 'contestant', contestantId: 'b' }, now: 1 });
    step({ type: 'closeWriting', by: { role: 'host' }, now: 2 });
    const answers = viewFor(s, { role: 'host' }, { hints: loadHintIndex() }).answers!;
    const known = (id: string, c: string) => answers.find((x) => x.contestantId === id && x.categoryId === c)?.known;
    expect(known('a', 'mesto')).toBe(true);
    expect(known('b', 'mesto')).toBe(false);
    expect(known('a', 'vec')).toBeNull();
  });
});
