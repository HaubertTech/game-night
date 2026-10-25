import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { THEMES } from '../src/lib/types.ts';
import {
  ART_AVATARS,
  avatarArt,
  avatarName,
  avatarText,
  freeArtAvatar,
  GAME_ART,
  LEVEL_ART,
  MANIFEST,
  pathFor,
  srcsetOf,
  THEME_ART,
} from '../src/lib/ui/art/art.ts';

describe('art manifest', () => {
  it('points at files that exist, variants included', () => {
    for (const entry of Object.values(MANIFEST)) {
      expect(existsSync(join('static', entry.path))).toBe(true);
      for (const v of entry.variants ?? []) expect(existsSync(join('static', v.path))).toBe(true);
    }
  });

  it('maps every quiz theme, level and game to an existing picture', () => {
    for (const t of THEMES) expect(MANIFEST[THEME_ART[t]]).toBeDefined();
    for (const key of Object.values(LEVEL_ART)) expect(MANIFEST[key]).toBeDefined();
    for (const key of Object.values(GAME_ART)) expect(MANIFEST[key]).toBeDefined();
  });

  it('builds srcset from the smaller variants and the original', () => {
    const card = MANIFEST['cards.prsi'];
    expect(srcsetOf(card)).toBe('/art/cards/prsi-600.webp 600w, /art/cards/prsi.webp 1200w');
  });

  it('picks the smallest variant that is sharp at 2×', () => {
    const fox = MANIFEST['avatars.liska'];
    expect(pathFor(fox, 40)).toBe('/art/avatars/liska-128.webp');
    expect(pathFor(fox, 100)).toBe('/art/avatars/liska-256.webp');
    expect(pathFor(fox, 400)).toBe('/art/avatars/liska.webp');
  });
});

describe('avatars', () => {
  it('offers 16 illustrated animals that fit the 16-character avatar column', () => {
    expect(ART_AVATARS).toHaveLength(16);
    for (const a of ART_AVATARS) expect(a.length).toBeLessThanOrEqual(16);
  });

  it('resolves art avatars and leaves emoji alone', () => {
    expect(avatarArt('art:liska')?.path).toBe('/art/avatars/liska.webp');
    expect(avatarName('art:liska')).toBe('Liška');
    expect(avatarArt('🦊')).toBeUndefined();
    expect(avatarArt('art:neexistuje')).toBeUndefined();
    expect(avatarArt(null)).toBeUndefined();
  });

  it('keeps emoji in text and drops art avatars', () => {
    expect(avatarText('🦊')).toBe('🦊');
    expect(avatarText('art:liska')).toBe('');
    expect(avatarText(undefined)).toBe('');
  });

  it('suggests an animal nobody uses yet', () => {
    expect(freeArtAvatar([])).toBe(ART_AVATARS[0]);
    expect(freeArtAvatar([ART_AVATARS[0], '🦊'])).toBe(ART_AVATARS[1]);
  });
});
