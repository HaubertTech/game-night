import { describe, expect, it } from 'vitest';
import { formatReport, validateQuestionFiles, type QuestionFile } from '../scripts/question-rules.ts';

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
    expect(result.summary.total).toBe(32);
    expect(Object.keys(result.summary.counts).sort()).toEqual(['hospoda', 'kocarek', 'lavice', 'piskoviste', 'prvnacek']);
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
    expect(errorsFor([{ ...base, text: 'x'.repeat(111) }])[0]).toMatch(/limit je 110/);
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
    expect(errors.some((e) => e.startsWith('Možnosti úrovně Pískoviště musí začínat emoji'))).toBe(true);
    const ok = { ...kid, image: '🥛', options: ['5️⃣ Pět', '🐔 Slepice', '🐮 Kráva'], answer: '5️⃣ Pět' };
    expect(errorsFor([ok], 'piskoviste/priroda.json')).toEqual([]);
  });

  it('wants 3–4 options for piskoviste and exactly 3 with pictures for prvnacek', () => {
    const kid = { ...base, id: 'piskoviste-priroda-001', level: 'piskoviste', image: '🥛', options: ['🐮 Kráva', '🐔 Slepice'], answer: '🐮 Kráva' };
    expect(errorsFor([kid], 'piskoviste/priroda.json')[0]).toMatch(/Počet možností 2, pro piskoviste je povoleno 3–4/);
    const first = { ...base, id: 'prvnacek-priroda-001', level: 'prvnacek', options: ['🐮 Kráva', '🐔 Slepice', '🐱 Kočka', '🐶 Pes'], answer: '🐮 Kráva' };
    const errors = errorsFor([first], 'prvnacek/priroda.json');
    expect(errors).toContain('Prvňáček musí mít image.');
    expect(errors.some((e) => /Počet možností 4, pro prvnacek je povoleno 3/.test(e))).toBe(true);
    expect(errorsFor([{ ...first, image: '🥛', options: ['🐮 Kráva', '🐔 Slepice', '🐱 Kočka'] }], 'prvnacek/priroda.json')).toEqual([]);
  });

  it('accepts point and imitate for kocarek and nothing else', () => {
    const point = { ...base, id: 'kocarek-priroda-001', level: 'kocarek', type: 'point', text: 'Ukaž pejska.', image: '🐶', options: ['🐶 Pejsek', '🐱 Kočička'], answer: '🐶 Pejsek' };
    const imitate = { id: 'kocarek-priroda-002', level: 'kocarek', theme: 'priroda', type: 'imitate', text: 'Jak dělá koza?', answer: 'Mééé', image: '🐐', fact: 'Kozím mláďatům se říká kůzlátka.', difficulty: 1, source: 'obecná znalost', status: 'verified' };
    expect(errorsFor([point, imitate], 'kocarek/priroda.json')).toEqual([]);
    const choice = { ...point, id: 'kocarek-priroda-003', type: 'choice', text: 'Kdo dělá haf?' };
    expect(errorsFor([choice], 'kocarek/priroda.json')).toContain('Typ choice není pro úroveň kocarek povolený.');
    expect(errorsFor([{ ...point, id: 'kocarek-priroda-004', text: 'x'.repeat(51) }], 'kocarek/priroda.json')[0]).toMatch(/limit je 50/);
  });

  it('requires a picture and a model answer for imitate, and no options', () => {
    const imitate = { id: 'kocarek-priroda-001', level: 'kocarek', theme: 'priroda', type: 'imitate', text: 'Jak dělá koza?', answer: '', fact: 'Kůzlátka.', difficulty: 1, source: 'x', status: 'verified', options: ['a', 'b'] };
    const errors = errorsFor([imitate], 'kocarek/priroda.json');
    expect(errors).toContain('Kočárek (imitate) musí mít image.');
    expect(errors.some((e) => e.startsWith('answer napodobování'))).toBe(true);
    expect(errors).toContain('Napodobování (imitate) nemá options.');
  });

  it('rejects point outside kocarek', () => {
    const point = { ...base, type: 'point', options: ['🐮 Kráva', '🐔 Slepice', '🐱 Kočka'], answer: '🐮 Kráva' };
    expect(errorsFor([point])).toContain('Typ point není pro úroveň lavice povolený.');
  });

  it('requires a fact that adds something and warns when it is too long', () => {
    expect(errorsFor([{ ...base, fact: ' ' }])).toContain('Chybí fact (zajímavost je povinná).');
    expect(errorsFor([{ ...base, fact: 'Kdo dává mléko?' }])).toContain('fact jen opakuje otázku.');
    const long = validateQuestionFiles([{ path: 'lavice/priroda.json', content: JSON.stringify([{ ...base, fact: 'a'.repeat(221) }]) }]);
    expect(long.issues.some((i) => i.severity === 'warning' && /fact má 221 znaků/.test(i.message))).toBe(true);
  });

  it('reports targets and what is missing per level', () => {
    const report = formatReport(validateQuestionFiles([{ path: 'lavice/priroda.json', content: JSON.stringify([base]) }]));
    expect(report).toMatch(/lavice\s+1 verified.*cíl 540, chybí 539/);
    expect(report).toMatch(/kocarek\s+0 verified.*cíl 240, chybí 240/);
  });

  it('rejects files outside <level>/<theme>.json and invalid JSON', () => {
    expect(validateQuestionFiles([{ path: 'hospoda/neznamo.json', content: '[]' }]).issues[0].severity).toBe('error');
    expect(validateQuestionFiles([{ path: 'hospoda/priroda.json', content: '{' }]).issues[0].message).toMatch(/Neplatný JSON/);
  });
});
