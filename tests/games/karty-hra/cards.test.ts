import { describe, expect, it } from 'vitest';
import { frenchCard, frenchCardName, isMariasCardId, mariasCardName, mariasDeck, shuffleDeck, zolikyDeck } from '../../../src/lib/games/karty-hra/cards.ts';

describe('karty', () => {
  it('mariášový balíček má 32 různých karet', () => {
    expect(new Set(mariasDeck()).size).toBe(32);
    expect(isMariasCardId('srdce-svrsek')).toBe(true);
    expect(isMariasCardId('srdce-6')).toBe(false);
  });

  it('české názvy karet', () => {
    expect(mariasCardName('srdce-7')).toBe('srdcová sedma');
    expect(mariasCardName('listy-svrsek')).toBe('zelený svršek');
    expect(mariasCardName('kule-eso')).toBe('kulové eso');
    expect(frenchCardName('piky-12-1')).toBe('dáma ♠');
    expect(frenchCardName('zolik-3')).toBe('žolík');
  });

  it('francouzské karty se dají rozložit zpět', () => {
    expect(frenchCard('kary-1-1')).toMatchObject({ joker: false, suit: 'kary', rank: 1, deck: 1 });
    expect(() => frenchCard('kary-14-0')).toThrow();
    expect(zolikyDeck().every((id) => frenchCard(id).id === id)).toBe(true);
  });

  it('míchání podle seedu je opakovatelné', () => {
    expect(shuffleDeck(mariasDeck(), 5)).toEqual(shuffleDeck(mariasDeck(), 5));
    expect(shuffleDeck(mariasDeck(), 5)).not.toEqual(shuffleDeck(mariasDeck(), 6));
  });
});
