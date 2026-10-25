import type { Level, Theme } from '../types.ts';

export const THEME_EMOJI: Record<Theme, string> = {
  priroda: '🌿',
  'cesko-svet': '🗺️',
  'veda-telo': '🔬',
  'pohadky-film-hudba': '🎬',
  'sport-hry': '⚽',
  jidlo: '🍲',
  'cisla-logika': '🔢',
  'slova-jazyk': '🔤',
  dejiny: '🏰',
};

export const LEVEL_EMOJI: Record<Level, string> = {
  kocarek: '🍼',
  piskoviste: '🪣',
  prvnacek: '🎒',
  lavice: '✏️',
  hospoda: '🍺',
};

export const AVATARS = ['🦊', '🐻', '🐸', '🦉', '🐰', '🐢', '🦔', '🐱', '🐶', '🐼', '🦁', '🐝', '🐞', '🐿️', '🦄', '🐧', '🐙', '🦕'];

export const TEAM_AVATARS = ['🍀', '🌻', '🍄', '🌙', '⭐', '🔥'];

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(n);
}

/** Years are written without a thousands separator („1918“, ne „1 918“). */
export function formatEstimate(n: number, unit: string): string {
  return unit.trim().toLowerCase() === 'rok' ? String(n) : formatNumber(n);
}

export function yearsLabel(n: number): string {
  if (n === 1) return '1 rok';
  if (n >= 2 && n <= 4) return `${n} roky`;
  return `${formatNumber(n)} let`;
}

/** „přesně!“, „vedle o 4 roky“ for absolute tolerance, „odchylka 12 %“ otherwise. */
export function deviationLabel(q: { unit: string; tolerance?: { full: number; partial: number } }, given: number, answer: number): string {
  const diff = Math.abs(given - answer);
  if (diff === 0) return 'přesně!';
  const absolute = q.tolerance !== undefined || q.unit.trim().toLowerCase() === 'rok';
  if (absolute) {
    return q.unit.trim().toLowerCase() === 'rok' ? `vedle o ${yearsLabel(diff)}` : `vedle o ${formatNumber(diff)} ${q.unit}`;
  }
  return `odchylka ${formatNumber(Math.round((diff / Math.abs(answer)) * 1000) / 10)} %`;
}

export function pointsLabel(n: number): string {
  if (n === 1) return '1 bod';
  if (n >= 2 && n <= 4) return `${n} body`;
  return `${n} bodů`;
}

export function gamesLabel(n: number): string {
  if (n === 1) return '1 hra';
  if (n >= 2 && n <= 4) return `${n} hry`;
  return `${n} her`;
}
