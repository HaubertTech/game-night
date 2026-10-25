import { describe, expect, it } from 'vitest';
import {
  ADULT_CATEGORIES,
  KIDS_CATEGORIES,
  alphabet,
  applyMjz,
  createMjzGame,
  drawLetters,
  normalizeAnswer,
  reduceMjz,
  startsWithLetter,
  toMatchResult,
  type Actor,
  type CreateMjzInput,
  type MjzCommand,
  type MjzState,
} from '../../../src/lib/games/mjz/engine.ts';
import { viewFor } from '../../../src/lib/games/mjz/view.ts';
import type { Contestant } from '../../../src/lib/engine/select.ts';
import categories from '../../../data/mjz/categories.json';

const HOST: Actor = { role: 'host' };
const SYSTEM: Actor = { role: 'system' };
const as = (contestantId: string): Actor => ({ role: 'contestant', contestantId });

const players: Contestant[] = [
  { id: 'tata', name: 'Táta', avatar: '🐻', level: 'hospoda', memberIds: ['tata'] },
  { id: 'mama', name: 'Máma', avatar: '🦊', level: 'hospoda', memberIds: ['mama'] },
  { id: 'ema', name: 'Ema', avatar: '🐰', level: 'lavice', memberIds: ['ema'] },
];

const T0 = 1_000_000;

function act(state: MjzState, cmd: MjzCommand, by: Actor = HOST, now = T0): MjzState {
  const r = applyMjz(state, { ...cmd, by, now } as Parameters<typeof applyMjz>[1]);
  if (!r.ok) throw new Error(`refused ${cmd.type}: ${r.error}`);
  return r.state;
}

function game(overrides: Partial<CreateMjzInput> = {}): MjzState {
  return createMjzGame({ seed: 42, contestants: players, ...overrides });
}

/** Two categories keep the scoring tests readable. */
const twoCats = { categories: [ADULT_CATEGORIES[0], ADULT_CATEGORIES[2]] };

/** Setup → writing with a fixed letter (redraws until the wanted letter comes up). */
function writing(state: MjzState, letter: string, now = T0): MjzState {
  let s = act(state, { type: 'start' });
  while (s.letter !== letter) s = act(s, { type: 'redraw' });
  return act(s, { type: 'startWriting' }, HOST, now);
}

describe('mjz: letters', () => {
  it('uses the Czech alphabet without Q, W, X, Y and diacritics', () => {
    const a = alphabet(false);
    expect(a).toHaveLength(22);
    for (const l of ['Q', 'W', 'X', 'Y', 'Č', 'Ř', 'Š', 'Ž', 'Ch']) expect(a).not.toContain(l);
    expect(alphabet(true)).toContain('Ch');
    expect(alphabet(true).indexOf('Ch')).toBe(alphabet(true).indexOf('H') + 1);
  });

  it('draws deterministically from the seed', () => {
    expect(drawLetters(42, false)).toEqual(drawLetters(42, false));
    expect(drawLetters(42, false)).not.toEqual(drawLetters(43, false));
    expect([...drawLetters(42, false)].sort()).toEqual([...alphabet(false)].sort());
  });

  it('never repeats a letter across rounds and redraws', () => {
    let s = act(game({ settings: { rounds: 8 } }), { type: 'start' });
    const seen = [s.letter];
    s = act(s, { type: 'redraw' });
    seen.push(s.letter);
    for (let r = 1; r < 8; r++) {
      s = act(act(act(s, { type: 'startWriting' }), { type: 'closeWriting' }), { type: 'next' });
      s = act(s, { type: 'next' });
      seen.push(s.letter);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(s.usedLetters).toEqual(seen);
  });

  it('refuses redraw when the alphabet is exhausted', () => {
    let s = act(game(), { type: 'start' });
    for (let i = 1; i < 22; i++) s = act(s, { type: 'redraw' });
    expect(applyMjz(s, { type: 'redraw', by: HOST, now: T0 })).toMatchObject({ ok: false, error: 'noLetters' });
  });

  it('checks the first letter: čárka is the same letter, háček is not, Ch is separate', () => {
    expect(startsWithLetter('Ábel', 'A', false)).toBe(true);
    expect(startsWithLetter('  praha', 'P', false)).toBe(true);
    expect(startsWithLetter('Čáslav', 'C', false)).toBe(false);
    expect(startsWithLetter('Cheb', 'C', false)).toBe(true);
    expect(startsWithLetter('Cheb', 'C', true)).toBe(false);
    expect(startsWithLetter('Cheb', 'Ch', true)).toBe(true);
    expect(startsWithLetter('Cheb', 'H', true)).toBe(false);
    expect(startsWithLetter('', 'A', false)).toBe(false);
  });
});

describe('mjz: normalization', () => {
  it('ignores diacritics, case, spaces and dashes', () => {
    expect(normalizeAnswer('Ústí nad Labem')).toBe(normalizeAnswer('usti nadlabem'));
    expect(normalizeAnswer('Frýdek-Místek')).toBe('frydekmistek');
    expect(normalizeAnswer('ŽÍRAFA')).toBe('zirafa');
  });
});

describe('mjz: writing, stop and timeout', () => {
  it('starts writing with per-level deadlines (lavice gets extra time)', () => {
    const s = writing(game(), game().letterOrder[0]);
    expect(s.phase).toBe('writing');
    expect(s.deadlines.tata).toBe(T0 + 90_000);
    expect(s.deadlines.ema).toBe(T0 + 120_000);
    expect(s.deadline).toBe(T0 + 120_000);
  });

  it('lets each contestant write only their own sheet', () => {
    const s = writing(game(), game().letterOrder[0]);
    expect(applyMjz(s, { type: 'write', answers: { mesto: 'X' }, contestantId: 'mama', by: as('tata'), now: T0 })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(applyMjz(s, { type: 'write', answers: { mesto: 'X' }, contestantId: 'tata', by: HOST, now: T0 })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(applyMjz(s, { type: 'write', answers: { nope: 'X' }, by: as('tata'), now: T0 })).toMatchObject({ ok: false, error: 'unknownCategory' });
    const next = act(s, { type: 'write', answers: { mesto: '  Praha   hlavní ' } }, as('tata'));
    expect(next.sheets.tata.mesto).toBe('Praha hlavní');
  });

  it('lets the host write for an assisted preschooler', () => {
    const kid: Contestant = { id: 'kuba', name: 'Kuba', avatar: '🐣', level: 'piskoviste', memberIds: ['kuba'] };
    const s = writing(game({ contestants: [...players, kid] }), game().letterOrder[0]);
    const next = act(s, { type: 'write', answers: { zvire: 'Pes' }, contestantId: 'kuba' }, HOST);
    expect(next.sheets.kuba.zvire).toBe('Pes');
  });

  it('Stop requires a complete sheet and gives the others 10 s', () => {
    let s = writing(game({ settings: twoCats }), 'P');
    expect(applyMjz(s, { type: 'stop', by: as('tata'), now: T0 + 5_000 })).toMatchObject({ ok: false, error: 'incomplete' });
    s = act(s, { type: 'write', answers: { mesto: 'Praha', zvire: 'Pes' } }, as('tata'), T0 + 5_000);
    s = act(s, { type: 'stop' }, as('tata'), T0 + 20_000);
    expect(s.stoppedBy).toBe('tata');
    expect(s.deadlines.mama).toBe(T0 + 30_000);
    expect(s.deadlines.ema).toBe(T0 + 30_000);
    expect(s.deadline).toBe(T0 + 30_000);
    // Writing after one's own deadline is refused.
    expect(applyMjz(s, { type: 'write', answers: { mesto: 'Plzeň' }, by: as('mama'), now: T0 + 30_000 })).toMatchObject({ ok: false, error: 'timeUp' });
    expect(applyMjz(s, { type: 'write', answers: { mesto: 'Praha 2' }, by: as('tata'), now: T0 + 21_000 })).toMatchObject({ ok: false, error: 'alreadyDone' });
  });

  it('a late Stop never extends a shorter deadline', () => {
    let s = writing(game({ settings: twoCats }), 'P');
    s = act(s, { type: 'write', answers: { mesto: 'Praha', zvire: 'Pes' } }, as('tata'), T0 + 85_000);
    s = act(s, { type: 'stop' }, as('tata'), T0 + 85_000);
    expect(s.deadlines.mama).toBe(T0 + 90_000);
    expect(s.deadlines.ema).toBe(T0 + 95_000);
  });

  it('timeout is accepted only from the system after the deadline', () => {
    const s = writing(game(), 'P');
    expect(applyMjz(s, { type: 'timeout', by: HOST, now: T0 + 200_000 })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(applyMjz(s, { type: 'timeout', by: SYSTEM, now: T0 + 119_999 })).toMatchObject({ ok: false, error: 'notYet' });
    expect(act(s, { type: 'timeout' }, SYSTEM, T0 + 120_000).phase).toBe('review');
  });

  it('moves to review once everyone is done', () => {
    let s = writing(game(), 'P');
    for (const p of players) s = act(s, { type: 'done' }, as(p.id), T0 + 1_000);
    expect(s.phase).toBe('review');
  });

  it('only the host controls the flow', () => {
    const s = game();
    expect(applyMjz(s, { type: 'start', by: as('tata'), now: T0 })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(applyMjz(s, { type: 'start', by: SYSTEM, now: T0 })).toMatchObject({ ok: false, error: 'forbidden' });
  });
});

/** Writes the given sheets at T0 and closes writing. */
function reviewWith(sheets: Record<string, Record<string, string>>, letter = 'P', settings: CreateMjzInput['settings'] = twoCats): MjzState {
  let s = writing(game({ settings }), letter);
  for (const [id, answers] of Object.entries(sheets)) s = act(s, { type: 'write', answers }, as(id), T0 + 1_000);
  return act(s, { type: 'closeWriting' });
}

function pointsOf(s: MjzState, contestantId: string, categoryId: string): number | undefined {
  return s.results.at(-1)!.answers.find((a) => a.contestantId === contestantId && a.categoryId === categoryId)?.points;
}

describe('mjz: scoring', () => {
  it('10 unique, 5 shared (diacritics/case ignored), 20 alone, 0 empty or wrong letter', () => {
    const s = act(
      reviewWith({
        tata: { mesto: 'Praha', zvire: 'Pes' },
        mama: { mesto: 'praha', zvire: 'Papoušek' },
        ema: { mesto: 'Plzeň', zvire: '' },
      }),
      { type: 'next' },
    );
    expect(s.phase).toBe('roundEnd');
    expect(pointsOf(s, 'tata', 'mesto')).toBe(5);
    expect(pointsOf(s, 'mama', 'mesto')).toBe(5);
    expect(pointsOf(s, 'ema', 'mesto')).toBe(10);
    expect(pointsOf(s, 'tata', 'zvire')).toBe(10);
    expect(pointsOf(s, 'mama', 'zvire')).toBe(10);
    expect(pointsOf(s, 'ema', 'zvire')).toBe(0);
    expect(s.scores).toEqual({ tata: 15, mama: 15, ema: 10 });
  });

  it('gives 20 to the only valid answer in a category', () => {
    const s = act(
      reviewWith({
        tata: { mesto: 'Písek', zvire: 'Ryba' },
        mama: { mesto: '', zvire: 'Kočka' },
        ema: { mesto: 'Brno', zvire: '' },
      }),
      { type: 'next' },
    );
    expect(pointsOf(s, 'tata', 'mesto')).toBe(20);
    expect(s.results[0].answers.find((a) => a.contestantId === 'ema' && a.categoryId === 'mesto')?.verdict).toBe('wrongLetter');
    expect(pointsOf(s, 'tata', 'zvire')).toBe(0);
  });

  it('applies the kids bonus ×1.5 rounded up to lavice only', () => {
    const sheets = { tata: { mesto: 'Praha', zvire: 'Pes' }, mama: { mesto: 'Praha', zvire: 'Panda' }, ema: { mesto: 'Plzeň', zvire: 'Pes' } };
    const off = act(reviewWith(sheets), { type: 'next' });
    expect(off.scores.ema).toBe(15);
    const on = act(reviewWith(sheets, 'P', { ...twoCats, kidsBonus: true }), { type: 'next' });
    expect(on.results[0].basePoints.ema).toBe(15);
    expect(on.scores.ema).toBe(23);
    expect(on.scores.tata).toBe(off.scores.tata);
  });

  it('lavice can write fewer categories', () => {
    const s = writing(
      game({ settings: { ...twoCats, levelRules: { ...game().settings.levelRules, lavice: { extraSeconds: 30, categoryIds: ['zvire'], assisted: false } } } }),
      'P',
    );
    expect(Object.keys(s.sheets.ema)).toEqual(['zvire']);
    expect(applyMjz(s, { type: 'write', answers: { mesto: 'Praha' }, by: as('ema'), now: T0 })).toMatchObject({ ok: false, error: 'unknownCategory' });
  });
});

describe('mjz: challenges and votes', () => {
  const sheets = { tata: { mesto: 'Pračka', zvire: 'Pes' }, mama: { mesto: 'Plzeň', zvire: 'Panda' }, ema: { mesto: 'Praha', zvire: 'Prase' } };

  it('a challenged answer is decided by the majority', () => {
    let s = reviewWith(sheets);
    s = act(s, { type: 'challenge', contestantId: 'tata', categoryId: 'mesto' }, as('mama'));
    expect(s.challenges['tata|mesto'].votes).toEqual({ mama: false });
    s = act(s, { type: 'vote', contestantId: 'tata', categoryId: 'mesto', valid: false }, as('ema'));
    s = act(s, { type: 'next' });
    expect(s.results[0].answers.find((a) => a.contestantId === 'tata' && a.categoryId === 'mesto')).toMatchObject({ verdict: 'invalid', decidedBy: 'vote', points: 0 });
    // With Pračka out, Plzeň and Praha are unique.
    expect(pointsOf(s, 'mama', 'mesto')).toBe(10);
  });

  it('a tie keeps the answer valid', () => {
    let s = reviewWith(sheets);
    s = act(s, { type: 'challenge', contestantId: 'tata', categoryId: 'mesto' }, as('mama'));
    s = act(s, { type: 'vote', contestantId: 'tata', categoryId: 'mesto', valid: true }, as('ema'));
    s = act(s, { type: 'next' });
    expect(pointsOf(s, 'tata', 'mesto')).toBe(10);
  });

  it('the host has the last word', () => {
    let s = reviewWith(sheets);
    s = act(s, { type: 'challenge', contestantId: 'tata', categoryId: 'mesto' }, as('mama'));
    s = act(s, { type: 'vote', contestantId: 'tata', categoryId: 'mesto', valid: false }, as('ema'));
    s = act(s, { type: 'rule', contestantId: 'tata', categoryId: 'mesto', valid: true });
    const scored = act(s, { type: 'next' });
    expect(scored.results[0].answers.find((a) => a.contestantId === 'tata' && a.categoryId === 'mesto')).toMatchObject({ verdict: 'valid', decidedBy: 'host' });
    // Ruling can be withdrawn.
    const back = act(act(s, { type: 'rule', contestantId: 'tata', categoryId: 'mesto', valid: null }), { type: 'next' });
    expect(pointsOf(back, 'tata', 'mesto')).toBe(0);
  });

  it('refuses own-answer challenges/votes, votes without challenge and wrong-letter answers', () => {
    const s = reviewWith({ ...sheets, ema: { mesto: 'Brno', zvire: 'Prase' } });
    const r = (cmd: MjzCommand, by: Actor) => applyMjz(s, { ...cmd, by, now: T0 } as Parameters<typeof applyMjz>[1]);
    expect(r({ type: 'challenge', contestantId: 'tata', categoryId: 'mesto' }, as('tata'))).toMatchObject({ error: 'ownAnswer' });
    expect(r({ type: 'vote', contestantId: 'tata', categoryId: 'mesto', valid: false }, as('mama'))).toMatchObject({ error: 'notChallengeable' });
    expect(r({ type: 'challenge', contestantId: 'ema', categoryId: 'mesto' }, as('mama'))).toMatchObject({ error: 'notChallengeable' });
    expect(r({ type: 'rule', contestantId: 'ema', categoryId: 'mesto', valid: true }, HOST)).toMatchObject({ error: 'notChallengeable' });
    expect(r({ type: 'rule', contestantId: 'tata', categoryId: 'mesto', valid: true }, as('mama'))).toMatchObject({ error: 'forbidden' });
  });
});

describe('mjz: viewFor', () => {
  it('hides other answers while writing, shows only fill counts', () => {
    let s = writing(game({ settings: twoCats }), 'P');
    s = act(s, { type: 'write', answers: { mesto: 'Praha' } }, as('tata'), T0 + 1_000);
    s = act(s, { type: 'write', answers: { mesto: 'Plzeň', zvire: 'Pes' } }, as('mama'), T0 + 1_000);
    const mine = viewFor(s, { role: 'contestant', contestantId: 'tata' });
    expect(mine.sheets).toEqual({ tata: { mesto: 'Praha', zvire: '' } });
    expect(mine.answers).toBeNull();
    expect(mine.contestants.find((c) => c.id === 'mama')).toMatchObject({ filled: 2, total: 2 });
    expect(mine.myDeadline).toBe(T0 + 90_000);
    const tv = viewFor(s, { role: 'host' });
    expect(tv.sheets).toEqual({});
    expect(JSON.stringify(tv)).not.toContain('Plzeň');
    expect(JSON.stringify(viewFor(s, { role: 'spectator' }))).not.toContain('Praha');
  });

  it('shows all answers with vote counts in review', () => {
    let s = reviewWith({ tata: { mesto: 'Praha', zvire: 'Pes' }, mama: { mesto: 'Plzeň', zvire: 'Pes' } });
    s = act(s, { type: 'challenge', contestantId: 'tata', categoryId: 'mesto' }, as('mama'));
    const v = viewFor(s, { role: 'contestant', contestantId: 'mama' });
    const praha = v.answers!.find((a) => a.contestantId === 'tata' && a.categoryId === 'mesto')!;
    expect(praha).toMatchObject({ text: 'Praha', challenged: true, votesInvalid: 1, myVote: false });
    expect(v.answers!.find((a) => a.contestantId === 'tata' && a.categoryId === 'zvire')).toMatchObject({ points: 5 });
  });
});

describe('mjz: end of game and league', () => {
  function playRound(s: MjzState, sheets: Record<string, Record<string, string>>): MjzState {
    s = act(s, { type: 'startWriting' });
    for (const [id, answers] of Object.entries(sheets)) s = act(s, { type: 'write', answers }, as(id));
    return act(act(s, { type: 'closeWriting' }), { type: 'next' });
  }

  it('finishes after the configured rounds and builds a MatchResult', () => {
    let s = act(game({ settings: { ...twoCats, rounds: 2 }, id: 'mjz-test', createdAt: '2026-10-25T18:00:00.000Z' }), { type: 'start' });
    const l1 = s.letter!;
    s = playRound(s, { tata: { mesto: `${l1}a`, zvire: `${l1}b` }, mama: { mesto: `${l1}a` } });
    s = act(s, { type: 'next' });
    expect(s.phase).toBe('letter');
    expect(s.letter).not.toBe(l1);
    const l2 = s.letter!;
    s = playRound(s, { mama: { mesto: `${l2}x` } });
    s = act(s, { type: 'next' });
    expect(s.phase).toBe('finished');
    expect(s.scores).toEqual({ tata: 25, mama: 25, ema: 0 });
    expect(applyMjz(s, { type: 'next', by: HOST, now: T0 })).toMatchObject({ ok: false, error: 'wrongPhase' });

    const m = toMatchResult(s, { nightId: 'night-1' });
    expect(m).toMatchObject({ matchId: 'mjz-test', gameType: 'mjz', playedAt: '2026-10-25T18:00:00.000Z', nightId: 'night-1' });
    expect(m.participants.map((p) => [p.participantId, p.place, p.score, p.kind])).toEqual([
      ['tata', 1, 25, 'player'],
      ['mama', 1, 25, 'player'],
      ['ema', 3, 0, 'player'],
    ]);
  });

  it('host can end early after a round', () => {
    let s = act(game(), { type: 'start' });
    s = act(act(act(s, { type: 'startWriting' }), { type: 'closeWriting' }), { type: 'next' });
    expect(act(s, { type: 'end' }).phase).toBe('finished');
  });

  it('kicking the last writer moves to review', () => {
    let s = writing(game(), 'P');
    s = act(s, { type: 'done' }, as('tata'));
    s = act(s, { type: 'done' }, as('mama'));
    s = act(s, { type: 'kick', contestantId: 'ema' });
    expect(s.phase).toBe('review');
  });

  it('is a pure reducer: refused actions keep the state, input is not mutated', () => {
    const s = game();
    const copy = JSON.parse(JSON.stringify(s));
    expect(reduceMjz(s, { type: 'next', by: HOST, now: T0 })).toBe(s);
    act(s, { type: 'start' });
    expect(s).toEqual(copy);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('mjz: data', () => {
  it('categories.json matches the engine defaults', () => {
    expect(categories.adult.categories).toEqual(ADULT_CATEGORIES);
    expect(categories.kids.categories).toEqual(KIDS_CATEGORIES);
  });

  it('rejects invalid settings', () => {
    expect(() => createMjzGame({ seed: 1, contestants: players, settings: { rounds: 30 } })).toThrow();
    const s = game();
    expect(applyMjz(s, { type: 'configure', settings: { timeSeconds: 1 }, by: HOST, now: T0 })).toMatchObject({ ok: false, error: 'invalidSettings' });
    const ch = act(s, { type: 'configure', settings: { includeCh: true, categories: KIDS_CATEGORIES } });
    expect(ch.letterOrder).toContain('Ch');
    expect(ch.settings.categories).toEqual(KIDS_CATEGORIES);
  });
});
