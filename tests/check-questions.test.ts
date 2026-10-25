import { describe, expect, it } from 'vitest';
import { validateQuestionFiles, type QuestionFile } from '../scripts/question-rules.ts';

const raw = import.meta.glob<string>('./fixtures/questions/**/*.json', { eager: true, query: '?raw', import: 'default' });
const fixtureFiles: QuestionFile[] = Object.entries(raw).map(([path, content]) => ({
  path: path.replace('./fixtures/questions/', ''),
  content,
}));

const base = {
  id: 'lavice-priroda-001',
  level: 'lavice',
  theme: 'priroda',
  type: 'choice',
  text: 'Kdo dává mléko?',
  options: ['Kráva', 'Slepice', 'Kočka'],
  answer: 'Kráva',
  fact: 'Kráva dá denně i dvacet litrů.',
  difficulty: 1,
  source: 'obecná znalost',
  status: 'verified',
};

function errorsFor(items: unknown[], path = 'lavice/priroda.json'): string[] {
  return validateQuestionFiles([{ path, content: JSON.stringify(items) }])
    .issues.filter((i) => i.severity === 'error')
    .map((i) => i.message);
}

describe('validateQuestionFiles', () => {
  it('accepts the e2e fixtures', () => {
    const result = validateQuestionFiles(fixtureFiles);
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.summary.total).toBe(21);
  });

  it('accepts a valid question', () => {
    expect(errorsFor([base])).toEqual([]);
  });

  it('rejects an answer outside options', () => {
    expect(errorsFor([{ ...base, answer: 'Koza' }])).toContain('answer musí přesně odpovídat jedné z možností.');
  });

  it('rejects ids and fields that do not match the path', () => {
    const errors = errorsFor([{ ...base, id: 'lavice-jidlo-001', theme: 'jidlo' }]);
    expect(errors.some((e) => e.startsWith('id neodpovídá'))).toBe(true);
    expect(errors.some((e) => e.startsWith('theme'))).toBe(true);
  });

  it('rejects duplicate ids and duplicate texts in one level', () => {
    const errors = errorsFor([base, { ...base, text: 'Kdo dává mléko!' }]);
    expect(errors.some((e) => e.startsWith('Duplicitní id'))).toBe(true);
    expect(errors.some((e) => e.startsWith('Duplicitní text'))).toBe(true);
  });

  it('enforces option counts, text length and allowed types per level', () => {
    expect(errorsFor([{ ...base, options: ['Kráva', 'Slepice'] }])[0]).toMatch(/Počet možností 2/);
    expect(errorsFor([{ ...base, text: 'x'.repeat(101) }])[0]).toMatch(/limit je 100/);
    expect(errorsFor([{ ...base, type: 'estimate', answer: 5, unit: 'l', options: undefined }])).toContain(
      'Typ estimate není pro úroveň lavice povolený.',
    );
  });

  it('requires image and emoji options for preschool', () => {
    const kid = {
      ...base,
      id: 'piskoviste-priroda-001',
      level: 'piskoviste',
      options: ['Kráva', '🐔 Slepice'],
    };
    const errors = errorsFor([kid], 'piskoviste/priroda.json');
    expect(errors).toContain('Pískoviště musí mít image.');
    expect(errors.some((e) => e.startsWith('Možnosti Pískoviště musí začínat emoji'))).toBe(true);
    const ok = { ...kid, image: '🥛', options: ['5️⃣ Pět', '🐔 Slepice'], answer: '5️⃣ Pět' };
    expect(errorsFor([ok], 'piskoviste/priroda.json')).toEqual([]);
  });

  it('rejects files outside <level>/<theme>.json and invalid JSON', () => {
    expect(validateQuestionFiles([{ path: 'hospoda/neznamo.json', content: '[]' }]).issues[0].severity).toBe('error');
    expect(validateQuestionFiles([{ path: 'hospoda/priroda.json', content: '{' }]).issues[0].message).toMatch(/Neplatný JSON/);
  });
});
