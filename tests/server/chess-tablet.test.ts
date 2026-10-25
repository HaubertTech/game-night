// POST /api/matches/chess: a two-player game from the tablet goes to the league once; the server
// replays the moves and refuses games against the computer, illegal moves and made-up results.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyChess, createChessGame, type ChessAction, type ChessState } from '#lib/games/chess/engine.ts';
import { closePool, query } from '#lib/server/db.ts';
import type { Household } from '#lib/server/repo/households.ts';
import { listParticipants } from '#lib/server/repo/matches.ts';
import { createPlayer, type Player } from '#lib/server/repo/players.ts';
import { POST } from '../../src/routes/api/matches/chess/+server.ts';
import { cleanup, fakeEvent, httpError, makeHousehold } from './helpers.ts';

let home: Household;
let other: Household;
let a: Player;
let b: Player;
let stranger: Player;

beforeAll(async () => {
  home = await makeHousehold('chess-tablet');
  other = await makeHousehold('chess-other');
  a = await createPlayer(home.id, { name: 'Táta', level: 'hospoda' });
  b = await createPlayer(home.id, { name: 'Kuba', level: 'lavice' });
  stranger = await createPlayer(other.id, { name: 'Cizí', level: 'hospoda' });
});
afterAll(async () => {
  await cleanup([home, other]);
  await closePool();
});

function play(moves: string[], extra: ChessAction[] = [], id = `t-${Math.random().toString(36).slice(2)}`): ChessState {
  let s = createChessGame({ id, mode: 'local', white: { id: `p${a.id}`, name: 'Táta' }, black: { id: `p${b.id}`, name: 'Kuba' }, allowUndo: false, createdAt: '2026-10-25T18:00:00.000Z' });
  let now = Date.parse('2026-10-25T18:00:00.000Z');
  const color = () => (s.fen.split(' ')[1] as 'w' | 'b');
  for (const uci of moves) {
    const r = applyChess(s, { type: 'move', move: uci, by: color(), now: (now += 1000) });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  for (const action of extra) {
    const r = applyChess(s, { ...action, now: (now += 1000) } as ChessAction);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

const MATE = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];

async function post(body: Record<string, unknown>) {
  return POST(fakeEvent({ body, household: home }) as never);
}

describe('POST /api/matches/chess', () => {
  it('records a mate once with winner and loser', async () => {
    const game = play(MATE);
    const res = await post({ game, white_id: a.id, black_id: b.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('recorded');
    const seats = await listParticipants(body.match_id);
    expect(seats.map((s) => [Number(s.player_id), s.place]).sort()).toEqual([[a.id, 1], [b.id, 2]].sort());
    const [row] = await query<{ game_type: string; mode: string; status: string }>('SELECT game_type, mode, status FROM matches WHERE id = $1', [body.match_id]);
    expect(row).toEqual({ game_type: 'chess', mode: 'pass', status: 'finished' });

    const again = await (await post({ game, white_id: a.id, black_id: b.id })).json();
    expect(again).toEqual({ status: 'already', match_id: body.match_id });
  });

  it('records a resignation and a draw by agreement', async () => {
    const resigned = play(['e2e4'], [{ type: 'resign', by: 'w' }]);
    expect((await post({ game: resigned, white_id: a.id, black_id: b.id })).status).toBe(200);
    const draw = play(['d2d4', 'd7d5'], [{ type: 'offerDraw', by: 'w' }, { type: 'acceptDraw', by: 'b' }]);
    const body = await (await post({ game: draw, white_id: a.id, black_id: b.id })).json();
    const seats = await listParticipants(body.match_id);
    expect(seats.map((s) => s.place)).toEqual([1, 1]);
  });

  it('refuses a made-up mate, illegal moves, the computer and foreign players', async () => {
    const fake = { ...play(['e2e4', 'e7e5']), result: { winner: 'w', reason: 'checkmate', text: 'Mat', at: 1 } };
    expect((await httpError(() => post({ game: fake, white_id: a.id, black_id: b.id }))).status).toBe(400);
    const illegal = { ...play(MATE), moves: [{ san: '?', uci: 'e2e5', at: 0 }] };
    expect((await httpError(() => post({ game: illegal, white_id: a.id, black_id: b.id }))).message).toMatch(/neplatný tah/);
    const vsComputer = play(MATE);
    vsComputer.players.b = { ...vsComputer.players.b, aiLevel: 2 };
    expect((await httpError(() => post({ game: vsComputer, white_id: a.id, black_id: b.id }))).message).toMatch(/počítači/);
    const unfinished = play(['e2e4']);
    expect((await httpError(() => post({ game: unfinished, white_id: a.id, black_id: b.id }))).message).toMatch(/neskončila/);
    expect((await httpError(() => post({ game: play(MATE), white_id: a.id, black_id: stranger.id }))).message).toMatch(/nepatří/);
    expect((await httpError(() => post({ game: play(MATE), white_id: a.id, black_id: a.id }))).status).toBe(400);
  });
});
