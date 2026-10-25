import { describe, expect, it } from 'vitest';
import { allQuestions, countQuestions, loadQuestions } from '../src/lib/questions.ts';
import { questionSpeech, stripEmoji } from '../src/lib/tts.ts';

const source = import.meta.glob('./fixtures/questions/**/*.json', { eager: true, import: 'default' });

describe('questions loader', () => {
  it('returns only verified questions by default', () => {
    const qs = loadQuestions({}, source);
    expect(qs.length).toBe(31);
    expect(qs.every((q) => q.status === 'verified')).toBe(true);
  });

  it('includes drafts on request', () => {
    expect(loadQuestions({ includeDraft: true }, source).length).toBe(32);
  });

  it('survives an empty or malformed dataset', () => {
    expect(loadQuestions({}, {})).toEqual([]);
    expect(allQuestions({ 'a.json': { not: 'an array' }, 'b.json': [null, 1, { id: 'x' }] })).toEqual([]);
  });

  it('counts questions per level and theme', () => {
    const counts = countQuestions(loadQuestions({}, source));
    expect(counts.piskoviste.total).toBe(6);
    expect(counts.piskoviste.priroda).toBe(4);
    expect(counts.hospoda.dejiny).toBe(3);
  });
});

describe('tts helpers', () => {
  it('strips emoji including keycaps', () => {
    expect(stripEmoji('🦔 Ježek')).toBe('Ježek');
    expect(stripEmoji('5️⃣ Pět')).toBe('Pět');
    expect(stripEmoji('👨‍👩‍👧 Rodina 🇨🇿')).toBe('Rodina');
  });

  it('reads options as a question', () => {
    expect(questionSpeech('Kdo dělá haf?', ['🐶 Pejsek', '🐱 Kočička'])).toEqual(['Kdo dělá haf?', 'Pejsek, nebo Kočička?']);
    expect(questionSpeech('Kolik?', [])).toEqual(['Kolik?']);
  });
});
