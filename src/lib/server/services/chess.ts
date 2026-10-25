// A finished two-player chess game from the tablet (/sachy/dva) sent to the league. The server
// replays the moves, so only a legal game with a consistent result is recorded. Idempotent by the
// tablet game id (matches.legacy_id = chess:<id>).

import { detectResult, replay, START_FEN, type ChessResult, type ChessState, type ResultReason } from '../../games/chess/engine.ts';
import { one, query, tx } from '../db.ts';
import { chessRecordInput } from '../games/chess.ts';
import { createMatch, findMatchByLegacyId } from '../repo/matches.ts';
import { recordMatch, ResultError } from './results.ts';

export interface TabletChessInput {
  game: unknown;
  whiteId: number;
  blackId: number;
  nightId?: number | null;
}

export type TabletChessOutcome = { status: 'recorded' | 'already'; matchId: number };

const REASONS: readonly ResultReason[] = ['checkmate', 'stalemate', 'resign', 'agreement', 'repetition', 'fifty', 'insufficient', 'timeout'];
/** Results the board itself decides; the others (resignation, agreement, time) come from the players. */
const BOARD_REASONS = new Set<ResultReason>(['checkmate', 'stalemate', 'repetition', 'fifty', 'insufficient']);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Checks the shape and the moves of a finished game; returns it with the server's own result text. */
export function parseFinishedChess(raw: unknown): ChessState {
  if (!isObj(raw) || raw.v !== 1 || typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 80) throw new ResultError('Neplatná partie.');
  if (raw.startFen !== START_FEN) throw new ResultError('Do ligy se zapisují jen partie ze základního postavení.');
  if (!Array.isArray(raw.moves) || raw.moves.length > 1000 || !raw.moves.every((m) => isObj(m) && typeof m.uci === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m.uci))) {
    throw new ResultError('Neplatný záznam tahů.');
  }
  const result = raw.result;
  if (!isObj(result) || !REASONS.includes(result.reason as ResultReason) || !(result.winner === null || result.winner === 'w' || result.winner === 'b')) {
    throw new ResultError('Partie ještě neskončila.');
  }
  const players = raw.players;
  if (!isObj(players) || !isObj(players.w) || !isObj(players.b) || players.w.aiLevel || players.b.aiLevel) throw new ResultError('Partie proti počítači se do ligy nezapisují.');
  let chess;
  try {
    chess = replay({ startFen: START_FEN, moves: raw.moves as ChessState['moves'] });
  } catch {
    throw new ResultError('Partie obsahuje neplatný tah.');
  }
  const reason = result.reason as ResultReason;
  const at = Number.isFinite(result.at) ? (result.at as number) : Date.now();
  const board = detectResult(chess, players as unknown as ChessState['players'], at);
  if (BOARD_REASONS.has(reason)) {
    if (!board || board.reason !== reason || board.winner !== result.winner) throw new ResultError('Výsledek nesouhlasí s pozicí na šachovnici.');
  } else if (board) {
    throw new ResultError('Výsledek nesouhlasí s pozicí na šachovnici.');
  } else if ((reason === 'resign' && result.winner === null) || (reason === 'agreement' && result.winner !== null)) {
    throw new ResultError('Neplatný výsledek partie.');
  }
  const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : new Date(at).toISOString();
  return {
    ...(raw as unknown as ChessState),
    createdAt,
    fen: chess.fen(),
    result: { ...(result as unknown as ChessResult), at },
  };
}

export async function recordTabletChess(householdId: number, input: TabletChessInput): Promise<TabletChessOutcome> {
  const game = parseFinishedChess(input.game);
  if (input.whiteId === input.blackId) throw new ResultError('Bílý a černý musí být dva různí hráči.');
  return tx(async (c) => {
    const legacyId = `chess:${game.id}`;
    const existing = await findMatchByLegacyId(householdId, legacyId, c);
    if (existing?.status === 'finished') return { status: 'already', matchId: existing.id };
    const rows = await query<{ id: number; name: string; avatar: string; level: ChessState['players']['w']['level'] }>(
      'SELECT id, name, avatar, level FROM players WHERE household_id = $1 AND archived_at IS NULL AND id = ANY($2::bigint[])',
      [householdId, [input.whiteId, input.blackId]],
      c,
    );
    if (rows.length !== 2) throw new ResultError('Někteří hráči do domácnosti nepatří.');
    if (input.nightId != null) {
      const night = await one<{ id: number }>('SELECT id FROM game_nights WHERE household_id = $1 AND id = $2', [householdId, input.nightId], c);
      if (!night) throw new ResultError('Takový večer neexistuje.', 404);
    }
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const seat = (id: number) => {
      const p = byId.get(id)!;
      return { id: `p${id}`, name: p.name, avatar: p.avatar, level: p.level };
    };
    const state: ChessState = { ...game, mode: 'local', players: { w: seat(input.whiteId), b: seat(input.blackId) } };
    const playedAt = new Date(game.result!.at).toISOString();
    const match =
      existing ??
      (await createMatch(
        householdId,
        { game_type: 'chess', mode: 'pass', status: 'running', legacy_id: legacyId, night_id: input.nightId ?? null, started_at: state.createdAt, state },
        c,
      ));
    await recordMatch(householdId, chessRecordInput(match.id, state, playedAt), c);
    return { status: 'recorded', matchId: match.id };
  });
}
