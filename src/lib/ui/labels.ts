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
  hospoda: '🍺',
  lavice: '✏️',
  piskoviste: '🪣',
};

export const AVATARS = ['🦊', '🐻', '🐸', '🦉', '🐰', '🐢', '🦔', '🐱', '🐶', '🐼', '🦁', '🐝', '🐞', '🐿️', '🦄', '🐧', '🐙', '🦕'];

export const TEAM_AVATARS = ['🍀', '🌻', '🍄', '🌙', '⭐', '🔥'];

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(n);
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
