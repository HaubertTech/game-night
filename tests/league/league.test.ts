import { describe, expect, it } from 'vitest';
import {
  bestPlayersOfNight,
  displayScore,
  headToHead,
  householdRecords,
  initialRating,
  matchLeaguePoints,
  playerAnswerStats,
  pointsForPlaces,
  quizAnswerFacts,
  quizToMatchResult,
  rateMatch,
  ratingLeaderboard,
  replayRatings,
  seasonStandings,
  standingsByGameType,
  type AnswerFact,
  type GameType,
  type MatchResult,
} from '../../src/lib/league/index.ts';

let seq = 0;
function match(
  places: Record<string, number>,
  opts: { gameType?: GameType; nightId?: string | null; playedAt?: string; teams?: Record<string, string[]>; scores?: Record<string, number> } = {},
): MatchResult {
  seq++;
  return {
    matchId: `m${seq}`,
    gameType: opts.gameType ?? 'quiz',
    playedAt: opts.playedAt ?? `2026-11-01T18:${String(seq % 60).padStart(2, '0')}:00Z`,
    nightId: opts.nightId === undefined ? 'n1' : opts.nightId,
    participants: Object.entries(places).map(([id, place]) => {
      const memberIds = opts.teams?.[id] ?? [id];
      return { participantId: id, kind: memberIds.length > 1 ? 'team' : 'player', memberIds, place, score: opts.scores?.[id] ?? null };
    }),
  };
}

describe('points', () => {
  it('uses the default table and 1 point for participation beyond it', () => {
    expect(pointsForPlaces([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([10, 7, 5, 3, 2, 1, 1, 1]);
  });

  it('averages shared places and rounds up', () => {
    expect(pointsForPlaces([1, 1, 3])).toEqual([9, 9, 5]);
    expect(pointsForPlaces([2, 1, 2, 2])).toEqual([5, 10, 5, 5]); // (7+5+3)/3 = 5
    expect(pointsForPlaces([1, 2, 2])).toEqual([10, 6, 6]); // (7+5)/2 = 6
  });

  it('accepts a custom table', () => {
    expect(pointsForPlaces([1, 2, 3], { places: [3, 1], participation: 0 })).toEqual([3, 1, 0]);
  });

  it('gives a team full points to every member', () => {
    const rows = matchLeaguePoints(match({ red: 1, kuba: 2 }, { teams: { red: ['tata', 'anicka'] } }));
    expect(rows).toEqual([
      { playerId: 'tata', participantId: 'red', place: 1, points: 10 },
      { playerId: 'anicka', participantId: 'red', place: 1, points: 10 },
      { playerId: 'kuba', participantId: 'kuba', place: 2, points: 7 },
    ]);
  });
});

describe('standings', () => {
  it('sums league points, matches, wins and average', () => {
    const ms = [match({ a: 1, b: 2 }), match({ a: 2, b: 1 }), match({ a: 1, b: 2 })];
    const [first, second] = seasonStandings(ms);
    expect(first).toMatchObject({ playerId: 'a', points: 27, matches: 3, wins: 2, average: 9, place: 1 });
    expect(second).toMatchObject({ playerId: 'b', points: 24, wins: 1, place: 2 });
  });

  it('breaks equal points by wins', () => {
    // x: 10 + 2 = 12 with 1 win; y: 7 + 5 = 12 with 0 wins; same evening
    const ms = [match({ x: 1, y: 2 }), match({ z: 1, w: 2, y: 3, q: 4, x: 5, r: 6 })];
    const rows = seasonStandings(ms).filter((r) => r.playerId === 'x' || r.playerId === 'y');
    expect(rows.map((r) => [r.playerId, r.points, r.wins, r.lastNightPoints])).toEqual([
      ['x', 12, 1, 12],
      ['y', 12, 0, 12],
    ]);
    expect(rows[0].place).toBeLessThan(rows[1].place);
  });

  it('shares the place when points, wins and last evening are equal', () => {
    const tied = seasonStandings([match({ a: 1, b: 2 }), match({ b: 1, a: 2 })]);
    expect(tied.map((r) => [r.playerId, r.points, r.wins, r.place])).toEqual([
      ['a', 17, 1, 1],
      ['b', 17, 1, 1],
    ]);
  });

  it('uses last evening points and then the name', () => {
    const ms = [
      match({ eva: 1, adam: 2 }, { nightId: 'n1', playedAt: '2026-11-01T18:00:00Z' }),
      match({ adam: 1, eva: 2 }, { nightId: 'n2', playedAt: '2026-11-08T18:00:00Z' }),
    ];
    // equal points (17) and wins (1); adam has 10 in the last evening n2
    expect(seasonStandings(ms).map((r) => [r.playerId, r.lastNightPoints, r.place])).toEqual([
      ['adam', 10, 1],
      ['eva', 7, 2],
    ]);
    const same = seasonStandings([match({ zofie: 1, adam: 1 })], { names: { zofie: 'Áda', adam: 'Zdeněk' } });
    expect(same.map((r) => r.playerId)).toEqual(['zofie', 'adam']);
    expect(same.map((r) => r.place)).toEqual([1, 1]);
  });

  it('includes players without a match', () => {
    const table = seasonStandings([match({ a: 1, b: 2 })], { playerIds: ['c'] });
    expect(table.at(-1)).toMatchObject({ playerId: 'c', points: 0, matches: 0, average: 0 });
  });

  it('finds the best player of an evening', () => {
    const ms = [match({ a: 1, b: 2 }, { nightId: 'n1' }), match({ b: 1, a: 2 }, { nightId: 'n2' }), match({ b: 1, a: 2 }, { nightId: 'n2' })];
    expect(bestPlayersOfNight(ms, 'n2').map((r) => r.playerId)).toEqual(['b']);
    expect(bestPlayersOfNight(ms, 'n1').map((r) => r.playerId)).toEqual(['a']);
    expect(bestPlayersOfNight(ms, 'none')).toEqual([]);
  });

  it('splits tables by game type', () => {
    const t = standingsByGameType([match({ a: 1, b: 2 }), match({ b: 1, a: 2 }, { gameType: 'prsi' })]);
    expect(t.quiz[0].playerId).toBe('a');
    expect(t.prsi[0].playerId).toBe('b');
    expect(t.zoliky).toEqual([]);
  });
});

describe('ratings', () => {
  it('starts at display 1000', () => {
    expect(displayScore(initialRating())).toBe(1000);
  });

  it('raises the winner and lowers the loser', () => {
    const { ratings, changes } = rateMatch({}, match({ a: 1, b: 2 }));
    expect(ratings.a.mu).toBeGreaterThan(25);
    expect(ratings.b.mu).toBeLessThan(25);
    const a = changes.find((c) => c.playerId === 'a')!;
    const b = changes.find((c) => c.playerId === 'b')!;
    expect(a.delta).toBeGreaterThan(0);
    expect(b.displayAfter).toBeLessThan(a.displayAfter);
    expect(a.before).toEqual(initialRating());
  });

  it('rates teams: every member of the winning team rises', () => {
    const { ratings } = rateMatch({}, match({ red: 1, blue: 2 }, { teams: { red: ['a', 'b'], blue: ['c', 'd'] } }));
    expect(ratings.a.mu).toBeGreaterThan(25);
    expect(ratings.b.mu).toBeGreaterThan(25);
    expect(ratings.c.mu).toBeLessThan(25);
    expect(ratings.d.mu).toBeLessThan(25);
  });

  it('does not change on a single-seat match', () => {
    const table = {};
    expect(rateMatch(table, match({ a: 1 })).ratings).toBe(table);
  });

  it('keeps game types separate when replaying', () => {
    const r = replayRatings([match({ a: 1, b: 2 }), match({ b: 1, a: 2 }, { gameType: 'prsi' })]);
    expect(r.quiz.a.mu).toBeGreaterThan(25);
    expect(r.prsi.a.mu).toBeLessThan(25);
    expect(r.zoliky).toEqual({});
    expect(ratingLeaderboard(r.quiz).map((x) => x.playerId)).toEqual(['a', 'b']);
  });
});

function fact(playerId: string, theme: AnswerFact['theme'], correct: boolean, i: number, extra: Partial<AnswerFact> = {}): AnswerFact {
  return {
    matchId: 'q1',
    playedAt: '2026-11-01T18:00:00Z',
    participantId: playerId,
    memberIds: [playerId],
    questionId: `${theme}-${i}`,
    theme,
    level: 'hospoda',
    correct,
    points: correct ? 1 : 0,
    seq: i,
    ...extra,
  };
}

describe('stats', () => {
  const facts: AnswerFact[] = [
    ...[true, true, true, true, false].map((c, i) => fact('a', 'priroda', c, i)),
    ...[true, false, false, false, false].map((c, i) => fact('a', 'jidlo', c, 10 + i)),
    ...[true, true].map((c, i) => fact('a', 'sport-hry', c, 20 + i)),
  ];

  it('computes success by theme and level with a minimum sample', () => {
    const s = playerAnswerStats(facts, 'a');
    expect(s.total).toBe(12);
    expect(s.correct).toBe(7);
    expect(s.byTheme.priroda).toEqual({ correct: 4, total: 5, rate: 0.8 });
    expect(s.byLevel.hospoda?.total).toBe(12);
    expect(s.bestTheme).toBe('priroda'); // sport-hry is 100 % but only 2 answers
    expect(s.worstTheme).toBe('jidlo');
    expect(s.longestStreak).toBe(4);
    expect(s.currentStreak).toBe(2);
  });

  it('returns nulls for a player without answers', () => {
    expect(playerAnswerStats(facts, 'nobody')).toMatchObject({ total: 0, rate: 0, bestTheme: null, worstTheme: null });
  });

  it('credits team answers to every member', () => {
    const team = [fact('red', 'jidlo', true, 0, { memberIds: ['tata', 'anicka'] })];
    expect(playerAnswerStats(team, 'anicka').correct).toBe(1);
  });

  it('counts head-to-head and skips teammates', () => {
    const ms = [
      match({ a: 1, b: 2 }),
      match({ a: 2, b: 1 }),
      match({ a: 1, b: 1 }),
      match({ red: 1, c: 2 }, { teams: { red: ['a', 'b'] } }),
    ];
    const h = headToHead(ms, 'a');
    expect(h.find((r) => r.opponentId === 'b')).toEqual({ opponentId: 'b', matches: 3, wins: 1, losses: 1, draws: 1 });
    expect(h.find((r) => r.opponentId === 'c')).toMatchObject({ matches: 1, wins: 1 });
    expect(headToHead(ms, 'a', 'prsi')).toEqual([]);
  });

  it('finds household records', () => {
    const ms = [
      match({ a: 1, b: 2 }, { scores: { a: 12, b: 30 }, nightId: 'n1' }),
      match({ a: 1, b: 2 }, { gameType: 'prsi', nightId: 'n1' }),
      match({ a: 1, b: 2 }, { gameType: 'zoliky', nightId: 'n2' }),
      match({ b: 1, a: 2 }, { nightId: 'n2' }),
    ];
    const r = householdRecords(ms, facts);
    expect(r.bestQuizScore).toMatchObject({ playerIds: ['b'], score: 30 });
    expect(r.longestAnswerStreak).toEqual({ playerId: 'a', length: 4 });
    expect(r.longestWinStreak).toEqual({ playerId: 'a', length: 3 });
    expect(r.mostWinsInNight).toEqual({ playerId: 'a', nightId: 'n1', wins: 2 });
    expect(householdRecords([])).toEqual({ bestQuizScore: null, longestAnswerStreak: null, longestWinStreak: null, mostWinsInNight: null });
  });
});

describe('quiz adapter', () => {
  const contestants = [
    { id: 'tata', level: 'hospoda' as const, memberIds: ['tata'] },
    { id: 'deti', level: 'lavice' as const, memberIds: ['anicka', 'kuba'] },
  ];
  const meta = { matchId: 'q9', playedAt: '2026-11-01T19:00:00Z', nightId: 'n1' };

  it('maps the engine ranking (Standing) and the flat form', () => {
    const fromStanding = quizToMatchResult(meta, [{ contestant: contestants[1], score: 8, place: 1 }, { contestant: contestants[0], score: 5, place: 2 }], contestants);
    const flat = quizToMatchResult(meta, [{ contestantId: 'deti', score: 8, place: 1 }, { contestantId: 'tata', score: 5, place: 2 }], contestants);
    expect(fromStanding).toEqual(flat);
    expect(flat.participants[0]).toEqual({ participantId: 'deti', kind: 'team', memberIds: ['anicka', 'kuba'], place: 1, score: 8 });
    expect(flat.participants[1].kind).toBe('player');
  });

  it('builds answer facts from the question theme and level', () => {
    const facts = quizAnswerFacts(
      meta,
      [
        { contestantId: 'deti', questionId: 'q-a', correct: true, points: 1 },
        { contestantId: 'tata', questionId: 'missing', correct: false, points: 0 },
      ],
      { 'q-a': { theme: 'priroda', level: 'piskoviste' } },
      contestants,
    );
    expect(facts).toEqual([
      expect.objectContaining({ memberIds: ['anicka', 'kuba'], theme: 'priroda', level: 'piskoviste', seq: 0 }),
    ]);
  });
});

describe('league points with computers at the table', () => {
  it('keeps the real place when computers took the places above', () => {
    expect(pointsForPlaces([3])).toEqual([5]);
    expect(pointsForPlaces([2, 4])).toEqual([7, 3]);
  });

  it('dense shared places still split positions as before', () => {
    expect(pointsForPlaces([1, 1, 2])).toEqual([9, 9, 5]);
  });
});
