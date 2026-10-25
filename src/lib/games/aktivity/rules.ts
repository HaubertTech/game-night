// Validation of data/aktivity/<level>.json. Pure (no fs), so it is type-checked and tested;
// scripts/check-aktivity.ts only reads the files and prints the report.

import { LEVELS, type Level } from '../../types.ts';
import { AKTIVITY_MODES, DIFFICULTIES, PRESCHOOL_MODES, type AktivityCard } from './types.ts';

export interface AktivityFile {
  /** File name relative to data/aktivity, e.g. `hospoda.json`. */
  path: string;
  content: string;
}

export interface AktivityIssue {
  severity: 'error' | 'warning';
  path: string;
  id?: string;
  message: string;
}

export interface AktivityReport {
  issues: AktivityIssue[];
  counts: Partial<Record<Level, number>>;
  cards: AktivityCard[];
}

const norm = (s: string) => s.trim().toLocaleLowerCase('cs');

export function validateAktivityFiles(files: AktivityFile[]): AktivityReport {
  const issues: AktivityIssue[] = [];
  const counts: Partial<Record<Level, number>> = {};
  const cards: AktivityCard[] = [];
  const ids = new Set<string>();
  /** normalized word → levels it appears in */
  const wordLevels = new Map<string, Set<Level>>();

  for (const file of files) {
    const err = (message: string, id?: string) => issues.push({ severity: 'error', path: file.path, id, message });
    const warn = (message: string, id?: string) => issues.push({ severity: 'warning', path: file.path, id, message });
    const level = file.path.replace(/\.json$/, '') as Level;
    if (!LEVELS.includes(level)) {
      err(`Neznámá úroveň v názvu souboru (čekám ${LEVELS.join(', ')}).`);
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(file.content);
    } catch (e) {
      err(`Neplatný JSON: ${(e as Error).message}`);
      continue;
    }
    if (!Array.isArray(data)) {
      err('Soubor musí obsahovat pole karet.');
      continue;
    }
    const words = new Map<string, string>();
    const byDifficulty = new Map<number, number>();
    for (const raw of data as Record<string, unknown>[]) {
      const id = typeof raw?.id === 'string' ? raw.id : undefined;
      if (!id || !new RegExp(`^${level}-\\d{3}$`).test(id)) err(`Id musí mít tvar ${level}-NNN.`, id);
      else if (ids.has(id)) err('Duplicitní id.', id);
      if (id) ids.add(id);
      if (raw.level !== level) err(`level musí být „${level}“ (podle souboru).`, id);
      const word = typeof raw.word === 'string' ? raw.word.trim() : '';
      if (!word) err('Chybí slovo.', id);
      else {
        const key = norm(word);
        const dup = words.get(key);
        if (dup) err(`Slovo „${word}“ už je v úrovni (${dup}).`, id);
        words.set(key, id ?? '?');
        if (!wordLevels.has(key)) wordLevels.set(key, new Set());
        wordLevels.get(key)!.add(level);
      }
      const modes: readonly string[] = level === 'piskoviste' ? [...PRESCHOOL_MODES, 'any'] : [...AKTIVITY_MODES, 'any'];
      if (typeof raw.mode !== 'string' || !modes.includes(raw.mode)) {
        err(`mode musí být ${modes.join('/')}.`, id);
      }
      if (!(DIFFICULTIES as readonly unknown[]).includes(raw.difficulty)) err('difficulty musí být 3, 4 nebo 5.', id);
      else byDifficulty.set(raw.difficulty as number, (byDifficulty.get(raw.difficulty as number) ?? 0) + 1);
      if (raw.image !== undefined && (typeof raw.image !== 'string' || raw.image.trim() === '')) err('image musí být emoji.', id);
      if (level === 'piskoviste' && !raw.image) err('Předškolák nečte: image (emoji) je povinný.', id);
      if (raw.forbidden !== undefined) {
        const f = raw.forbidden;
        if (!Array.isArray(f) || f.some((x) => typeof x !== 'string' || x.trim() === '')) {
          err('forbidden musí být pole neprázdných slov.', id);
        } else if (word && f.some((x) => norm(x as string) === norm(word))) {
          err('forbidden nesmí obsahovat samotné slovo.', id);
        }
      } else if (level === 'hospoda' && (raw.mode === 'rekni' || raw.mode === 'any')) {
        warn('Karta pro „řekni“ v hospodě nemá zakázaná slova.', id);
      }
      const unknownKeys = Object.keys(raw).filter((k) => !['id', 'level', 'word', 'mode', 'difficulty', 'image', 'forbidden'].includes(k));
      if (unknownKeys.length > 0) warn(`Neznámé klíče: ${unknownKeys.join(', ')}.`, id);
      cards.push(raw as unknown as AktivityCard);
    }
    counts[level] = data.length;
    for (const d of DIFFICULTIES) {
      const n = byDifficulty.get(d) ?? 0;
      if (data.length > 0 && n < data.length / 4) warn(`Málo karet obtížnosti ${d} (${n} z ${data.length}).`);
    }
  }

  // Allowed (levels draw from separate decks, the engine skips a word already played in the game),
  // but listed so an accidental copy between levels is visible.
  const shared = [...wordLevels].filter(([, levels]) => levels.size > 1).map(([word]) => word);
  if (shared.length > 0) {
    issues.push({ severity: 'warning', path: '*', message: `Slova ve více úrovních (${shared.length}): ${shared.join(', ')}.` });
  }
  return { issues, counts, cards };
}

export function formatAktivityReport(report: AktivityReport): string {
  const lines = report.issues.map(
    (i) => `${i.severity === 'error' ? 'CHYBA' : 'varování'} ${i.path}${i.id ? ` ${i.id}` : ''}: ${i.message}`,
  );
  const errors = report.issues.filter((i) => i.severity === 'error').length;
  const warnings = report.issues.length - errors;
  const counts = Object.entries(report.counts)
    .map(([l, n]) => `${l} ${n}`)
    .join(', ');
  lines.push(`Karty: ${counts || 'žádné'} · chyb ${errors}, varování ${warnings}`);
  return lines.join('\n');
}
