// Pure validation of question files against the dataset contract (src/lib/types.ts,
// data/questions/README.md). No Node APIs here, so it is type-checked and unit-tested.

import type { Level, Theme } from '../src/lib/types.ts';
import { LEVELS, PRESCHOOL_THEMES, THEMES } from '../src/lib/types.ts';

export interface QuestionFile {
  /** Path relative to the dataset root, e.g. `hospoda/priroda.json`. */
  path: string;
  content: string;
}

export interface Issue {
  severity: 'error' | 'warning';
  file: string;
  id?: string;
  message: string;
}

export interface Summary {
  /** level → theme → status → count */
  counts: Record<string, Record<string, Record<string, number>>>;
  /** level → type → count */
  types: Record<string, Record<string, number>>;
  total: number;
}

export interface ValidationResult {
  issues: Issue[];
  summary: Summary;
}

export const TEXT_LIMITS: Record<Level, number> = { hospoda: 160, lavice: 100, piskoviste: 60 };
export const OPTION_COUNTS: Record<Level, [number, number]> = { hospoda: [4, 4], lavice: [3, 4], piskoviste: [2, 3] };
export const ALLOWED_TYPES: Record<Level, string[]> = {
  hospoda: ['choice', 'estimate', 'open'],
  lavice: ['choice'],
  piskoviste: ['choice'],
};
export const TARGETS: Record<Level, number> = { hospoda: 270, lavice: 135, piskoviste: 84 };

const COMMON_FIELDS = ['id', 'level', 'theme', 'type', 'text', 'fact', 'difficulty', 'image', 'source', 'status'];
const TYPE_FIELDS: Record<string, string[]> = {
  choice: ['options', 'answer'],
  estimate: ['answer', 'unit'],
  open: ['answer', 'accept'],
};

// Pictographs, flags and keycaps ("5️⃣").
const STARTS_WITH_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3)/u;

/** Lowercase, no diacritics, no punctuation — for duplicate detection. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validateQuestionFiles(files: QuestionFile[]): ValidationResult {
  const issues: Issue[] = [];
  const summary: Summary = { counts: {}, types: {}, total: 0 };
  const ids = new Map<string, string>();
  const texts = new Map<string, { level: Level; id: string; file: string }[]>();

  for (const file of files.slice().sort((a, b) => a.path.localeCompare(b.path))) {
    const err = (message: string, id?: string) => issues.push({ severity: 'error', file: file.path, id, message });
    const warn = (message: string, id?: string) => issues.push({ severity: 'warning', file: file.path, id, message });

    const parts = file.path.replace(/\\/g, '/').split('/');
    const [levelPart, themeFile] = parts;
    const themePart = themeFile?.replace(/\.json$/, '');
    if (parts.length !== 2 || !LEVELS.includes(levelPart as Level) || !THEMES.includes(themePart as Theme)) {
      err('Soubor musí ležet v <level>/<theme>.json se známou úrovní a tématem.');
      continue;
    }
    const fileLevel = levelPart as Level;
    const fileTheme = themePart as Theme;
    if (fileLevel === 'piskoviste' && !PRESCHOOL_THEMES.includes(fileTheme)) {
      warn(`Téma ${fileTheme} není mezi tématy Pískoviště (PRESCHOOL_THEMES).`);
    }

    let data: unknown;
    try {
      data = JSON.parse(file.content);
    } catch (e) {
      err(`Neplatný JSON: ${(e as Error).message}`);
      continue;
    }
    if (!Array.isArray(data)) {
      err('Obsah souboru musí být pole otázek.');
      continue;
    }

    data.forEach((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        err(`Položka #${index} není objekt.`);
        return;
      }
      const q = raw as Record<string, unknown>;
      const id = typeof q.id === 'string' ? q.id : `#${index}`;
      const e = (m: string) => err(m, id);
      const w = (m: string) => warn(m, id);

      // id
      if (typeof q.id !== 'string') e('Chybí id.');
      else {
        const m = q.id.match(/^([a-z]+)-([a-z-]+)-(\d{3})$/);
        if (!m) e('id musí mít tvar <level>-<theme>-NNN.');
        else if (m[1] !== fileLevel || m[2] !== fileTheme) e(`id neodpovídá souboru (${fileLevel}-${fileTheme}-NNN).`);
        const prev = ids.get(q.id);
        if (prev) e(`Duplicitní id (už v ${prev}).`);
        else ids.set(q.id, file.path);
      }

      // level / theme
      if (q.level !== fileLevel) e(`level „${String(q.level)}“ neodpovídá cestě (${fileLevel}).`);
      if (q.theme !== fileTheme) e(`theme „${String(q.theme)}“ neodpovídá cestě (${fileTheme}).`);
      const level = fileLevel;

      // type
      const type = q.type;
      if (typeof type !== 'string' || !(type in TYPE_FIELDS)) {
        e(`Neznámý type „${String(type)}“.`);
        return;
      }
      if (!ALLOWED_TYPES[level].includes(type)) e(`Typ ${type} není pro úroveň ${level} povolený.`);

      // unknown fields
      const known = new Set([...COMMON_FIELDS, ...TYPE_FIELDS[type]]);
      const unknown = Object.keys(q).filter((k) => !known.has(k));
      if (unknown.length) w(`Neznámá pole: ${unknown.join(', ')}.`);

      // text
      if (!isNonEmptyString(q.text)) e('Chybí text.');
      else if ([...q.text].length > TEXT_LIMITS[level]) e(`Text má ${[...q.text].length} znaků, limit je ${TEXT_LIMITS[level]}.`);

      // fact, difficulty, status, image, source
      if (!isNonEmptyString(q.fact)) e('Chybí fact.');
      if (q.difficulty !== 1 && q.difficulty !== 2 && q.difficulty !== 3) e('difficulty musí být 1, 2 nebo 3.');
      if (q.status !== 'verified' && q.status !== 'draft') e('status musí být verified nebo draft.');
      if (q.image !== undefined && !isNonEmptyString(q.image)) e('image musí být neprázdný řetězec.');
      if (level === 'piskoviste' && !isNonEmptyString(q.image)) e('Pískoviště musí mít image.');
      if (q.source !== undefined && !isNonEmptyString(q.source)) e('source musí být neprázdný řetězec.');
      if (q.source === undefined) w('Chybí source.');

      // type-specific
      if (type === 'choice') {
        const options = q.options;
        if (!Array.isArray(options) || !options.every(isNonEmptyString)) e('options musí být pole neprázdných řetězců.');
        else {
          const [min, max] = OPTION_COUNTS[level];
          if (options.length < min || options.length > max) {
            e(`Počet možností ${options.length}, pro ${level} je povoleno ${min === max ? min : `${min}–${max}`}.`);
          }
          if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) e('Možnosti se opakují.');
          if (!isNonEmptyString(q.answer) || !options.includes(q.answer)) e('answer musí přesně odpovídat jedné z možností.');
          if (level === 'piskoviste') {
            const bad = options.filter((o) => !STARTS_WITH_EMOJI.test(o));
            if (bad.length) e(`Možnosti Pískoviště musí začínat emoji: ${bad.join(', ')}.`);
          }
        }
      } else if (type === 'estimate') {
        if (typeof q.answer !== 'number' || !Number.isFinite(q.answer) || q.answer <= 0) e('answer odhadu musí být kladné číslo.');
        if (typeof q.unit !== 'string') e('Odhad musí mít unit.');
      } else if (type === 'open') {
        if (!isNonEmptyString(q.answer)) e('answer otevřené otázky musí být neprázdný řetězec.');
        else if (q.answer.trim().split(/\s+/).length > 3) w('Odpověď má víc než tři slova.');
        if (q.accept !== undefined && (!Array.isArray(q.accept) || !q.accept.every(isNonEmptyString))) {
          e('accept musí být pole neprázdných řetězců.');
        }
      }

      // duplicates by text
      if (isNonEmptyString(q.text)) {
        const key = normalizeText(q.text);
        const list = texts.get(key) ?? [];
        list.push({ level, id, file: file.path });
        texts.set(key, list);
      }

      // summary
      const status = typeof q.status === 'string' ? q.status : 'invalid';
      const byTheme = (summary.counts[level] ??= {});
      const byStatus = (byTheme[fileTheme] ??= {});
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      const byType = (summary.types[level] ??= {});
      byType[type] = (byType[type] ?? 0) + 1;
      summary.total++;
    });
  }

  for (const list of texts.values()) {
    if (list.length < 2) continue;
    const others = list.map((x) => x.id).join(', ');
    for (const x of list.slice(1)) {
      const sameLevel = list.some((y) => y !== x && y.level === x.level);
      issues.push({
        severity: sameLevel ? 'error' : 'warning',
        file: x.file,
        id: x.id,
        message: sameLevel ? `Duplicitní text (${others}).` : `Stejný text na jiné úrovni (${others}).`,
      });
    }
  }

  return { issues, summary };
}

/** Human-readable report (Czech, for the terminal). */
export function formatReport(result: ValidationResult): string {
  const lines: string[] = [];
  const errors = result.issues.filter((i) => i.severity === 'error');
  const warnings = result.issues.filter((i) => i.severity === 'warning');
  for (const i of [...errors, ...warnings]) {
    lines.push(`${i.severity === 'error' ? 'CHYBA' : 'varování'}  ${i.file}${i.id ? ` [${i.id}]` : ''}: ${i.message}`);
  }
  if (lines.length) lines.push('');

  lines.push('Souhrn (verified / draft):');
  for (const level of LEVELS) {
    const byTheme = result.summary.counts[level] ?? {};
    let verified = 0;
    let draft = 0;
    const row: string[] = [];
    for (const theme of THEMES) {
      const s = byTheme[theme];
      if (!s) continue;
      verified += s.verified ?? 0;
      draft += s.draft ?? 0;
      row.push(`${theme} ${s.verified ?? 0}/${s.draft ?? 0}`);
    }
    const types = Object.entries(result.summary.types[level] ?? {})
      .map(([t, n]) => `${t} ${n}`)
      .join(', ');
    lines.push(`  ${level.padEnd(10)} ${String(verified).padStart(4)} verified, ${String(draft).padStart(3)} draft (cíl ${TARGETS[level]})${types ? ` · ${types}` : ''}`);
    if (row.length) lines.push(`             ${row.join(' · ')}`);
  }
  lines.push(`  celkem ${result.summary.total} otázek · ${errors.length} chyb · ${warnings.length} varování`);
  return lines.join('\n');
}
