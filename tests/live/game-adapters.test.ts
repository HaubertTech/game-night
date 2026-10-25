// Game adapters of live rooms: data loading through node:fs and the league input of finished games.

import { describe, expect, it } from 'vitest';
import { applyAktivity, createAktivity, type AktivityAction, type AktivityCommand, type AktivityState } from '../../src/lib/games/aktivity/engine.ts';
import { applyMjz, createMjzGame, type MjzAction, type MjzCommand, type MjzState } from '../../src/lib/games/mjz/engine.ts';
import { aktivityAdapter, aktivityRecordInput, loadAktivityCards } from '../../src/lib/server/games/aktivity.ts';
import { adapterFor } from '../../src/lib/server/games/index.ts';
import { mjzAdapter, mjzHints, mjzRecordInput } from '../../src/lib/server/games/mjz.ts';
import { quizAdapter } from '../../src/lib/server/games/quiz.ts';

const host = { role: 'host' } as const;

function aktivity(...steps: AktivityCommand[]): AktivityState {
  let s = createAktivity(
    {
      seed: 5,
      createdAt: '2026-10-25T18:00:00.000Z',
      teams: [
        { id: 't1', name: 'A', players: [{ id: 'p1', name: 'Táta', level: 'hospoda' }, { id: 'p2', name: 'Máma', level: 'hospoda' }] },
        { id: 't2', name: 'B', players: [{ id: 'p3', name: 'Anna', level: 'lavice' }, { id: 'p4', name: 'Petr', level: 'hospoda' }] },
      ],
      goal: { kind: 'rounds', rounds: 1 },
    },
    loadAktivityCards(),
  );
  let now = 1000;
  for (const step of steps) {
    const r = applyAktivity(s, { ...step, by: host, now: (now += 1000) } as AktivityAction);
    if (!r.ok) throw new Error(`${step.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}

describe('aktivity adapter', () => {
  it('loads every word card of data/aktivity', () => {
    const cards = loadAktivityCards();
    expect(cards.length).toBeGreaterThanOrEqual(600);
    expect(new Set(cards.map((c) => c.level))).toEqual(new Set(['hospoda', 'lavice', 'piskoviste']));
  });

  it('times out only a running turn', () => {
    const intro = aktivity({ type: 'start' });
    expect(aktivityAdapter.timeoutAt(intro)).toBeNull();
    const playing = aktivity({ type: 'start' }, { type: 'startTurn', difficulty: 3 });
    expect(aktivityAdapter.timeoutAt(playing)).toBe(playing.deadline);
    expect(aktivityAdapter.timeout(playing, playing.deadline! - 1)).toBeNull();
    expect(aktivityAdapter.timeout(playing, playing.deadline!)?.phase).toBe('result');
  });

  it('records teams as team seats with player members and the played cards as seen', () => {
    const s = aktivity(
      { type: 'start' },
      { type: 'startTurn', difficulty: 5 },
      { type: 'guessed' },
      { type: 'next' },
      { type: 'startTurn', difficulty: 3 },
      { type: 'skip' },
      { type: 'next' },
    );
    expect(s.phase).toBe('finished');
    const input = aktivityRecordInput(42, s, '2026-10-25T19:00:00.000Z');
    expect(input).toMatchObject({ matchId: 42, gameType: 'aktivity' });
    expect(input.participants).toEqual([
      { participantId: 't1', kind: 'team', teamId: 1, memberIds: [1, 2], place: 1, score: s.scores.t1 },
      { participantId: 't2', kind: 'team', teamId: 2, memberIds: [3, 4], place: 2, score: 0 },
    ]);
    expect(input.seen).toEqual(s.history.map((h) => h.cardId));
  });
});

describe('mjz adapter', () => {
  it('reads the hint lists with node:fs', () => {
    const hints = mjzHints();
    expect(hints.get('mesta')?.size).toBeGreaterThan(10);
    expect(hints.has('zvirata')).toBe(true);
  });

  it('records players and teams with recomputed places, without kicked contestants', () => {
    let s: MjzState = createMjzGame({
      seed: 3,
      contestants: [
        { id: 'p1', name: 'A', avatar: '🐻', level: 'hospoda', memberIds: ['1'] },
        { id: 't7', name: 'T', avatar: '👥', level: 'hospoda', memberIds: ['2', '3'] },
        { id: 'p4', name: 'K', avatar: '🐸', level: 'hospoda', memberIds: ['4'] },
      ],
    });
    const step = (a: MjzCommand) => {
      const r = applyMjz(s, { ...a, by: host, now: 5000 } as MjzAction);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    };
    step({ type: 'kick', contestantId: 'p4' });
    s = { ...s, phase: 'finished', scores: { p1: 10, t7: 30, p4: 50 } };
    const input = mjzRecordInput(9, s, '2026-10-25T19:00:00.000Z');
    expect(input.gameType).toBe('mjz');
    expect(input.participants).toEqual([
      { participantId: 't7', kind: 'team', teamId: 7, memberIds: [2, 3], place: 1, score: 30 },
      { participantId: 'p1', kind: 'player', playerId: 1, memberIds: [1], place: 2, score: 10 },
    ]);
    expect(mjzAdapter.kicked(s)).toEqual(['p4']);
  });
});

describe('adapters', () => {
  it('treats rooms without a game as quiz rooms', () => {
    expect(adapterFor(undefined)).toBe(quizAdapter);
    expect(adapterFor('mjz')).toBe(mjzAdapter);
  });
});
