// A finished Člověče, nezlob se game from one tablet (/clovece) sent to the league. The server
// replays the game from its seed and history, so only a game the rules actually produced is
// recorded; names and avatars come from the household's players. Computers are left out, places
// stay as at the whole table. Idempotent by the tablet game id (matches.legacy_id = clovece:<id>).

import {
  normalizeSettings,
  replayClovece,
  toMatchResult,
  type AiLevel,
  type CloveceSettings,
  type CloveceState,
} from '../../games/clovece/engine.ts';
import { one, query, tx } from '../db.ts';
import { createMatch, findMatchByLegacyId } from '../repo/matches.ts';
import { recordMatch, ResultError, type RecordParticipant } from './results.ts';

export type TabletCloveceOutcome = { status: 'recorded' | 'already'; matchId: number };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

interface ParsedGame {
  id: string;
  createdAt: string;
  seed: number;
  settings: CloveceSettings;
  seats: { id: string; ai: AiLevel | null; playerId: number | null }[];
  history: number[];
}

/** Shape check of the body's `game` (no DB): ids, seed, settings, seats, history. */
export function parseTabletClovece(raw: unknown): ParsedGame {
  if (!isObj(raw) || typeof raw.id !== 'string' || !/^[\w-]{1,80}$/.test(raw.id)) throw new ResultError('Neplatná hra.');
  if (!Number.isInteger(raw.seed) || (raw.seed as number) < 0 || (raw.seed as number) > 0xffffffff) throw new ResultError('Neplatná hra.');
  const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : null;
  if (!createdAt) throw new ResultError('Neplatná hra.');
  if (!Array.isArray(raw.history) || raw.history.length > 20000 || !raw.history.every((h) => Number.isInteger(h) && h >= -1 && h < 4)) {
    throw new ResultError('Neplatný záznam tahů.');
  }
  if (!Array.isArray(raw.players) || raw.players.length < 2 || raw.players.length > 4) throw new ResultError('Hrají 2 až 4 hráči.');
  const seats = raw.players.map((p) => {
    if (!isObj(p) || typeof p.id !== 'string') throw new ResultError('Neplatný hráč.');
    const ai = p.ai === 1 || p.ai === 2 || p.ai === 3 ? (p.ai as AiLevel) : null;
    const m = /^p(\d{1,15})$/.exec(p.id);
    if (!ai && !m) throw new ResultError('Do ligy se zapisují jen hráči domácnosti.');
    return { id: p.id, ai, playerId: ai ? null : Number(m![1]) };
  });
  if (!seats.some((s) => s.playerId !== null)) throw new ResultError('Hra bez lidí se do ligy nezapisuje.');
  const settings = normalizeSettings(isObj(raw.settings) ? (raw.settings as Partial<CloveceSettings>) : {});
  return { id: raw.id, createdAt, seed: raw.seed as number, settings, seats, history: raw.history as number[] };
}

export async function recordTabletClovece(householdId: number, rawGame: unknown, nightId: number | null): Promise<TabletCloveceOutcome> {
  const game = parseTabletClovece(rawGame);
  return tx(async (c) => {
    const legacyId = `clovece:${game.id}`;
    const existing = await findMatchByLegacyId(householdId, legacyId, c);
    if (existing?.status === 'finished') return { status: 'already', matchId: existing.id };
    const ids = game.seats.flatMap((s) => (s.playerId === null ? [] : [s.playerId]));
    if (new Set(ids).size !== ids.length) throw new ResultError('Hráč je ve hře dvakrát.');
    const rows = await query<{ id: number; name: string; avatar: string; level: CloveceState['players'][number]['level'] }>(
      'SELECT id, name, avatar, level FROM players WHERE household_id = $1 AND archived_at IS NULL AND id = ANY($2::bigint[])',
      [householdId, ids],
      c,
    );
    if (rows.length !== ids.length) throw new ResultError('Někteří hráči do domácnosti nepatří.');
    if (nightId != null) {
      const night = await one<{ id: number }>('SELECT id FROM game_nights WHERE household_id = $1 AND id = $2', [householdId, nightId], c);
      if (!night) throw new ResultError('Takový večer neexistuje.', 404);
    }
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    let state: CloveceState;
    try {
      state = replayClovece(
        {
          id: game.id,
          createdAt: game.createdAt,
          seed: game.seed,
          nightId: nightId === null ? null : String(nightId),
          settings: game.settings,
          players: game.seats.map((s, i) => {
            const p = s.playerId === null ? null : byId.get(s.playerId)!;
            return p ? { id: s.id, name: p.name, avatar: p.avatar, level: p.level, ai: null } : { id: s.id, name: `Počítač ${i + 1}`, ai: s.ai };
          }),
        },
        game.history,
      );
    } catch {
      throw new ResultError('Záznam hry nesouhlasí s pravidly.');
    }
    if (state.phase !== 'finished') throw new ResultError('Hra ještě neskončila.');
    const playedAt = new Date().toISOString();
    const match =
      existing ??
      (await createMatch(
        householdId,
        { game_type: 'clovece', mode: 'pass', status: 'running', legacy_id: legacyId, night_id: nightId, started_at: game.createdAt, state },
        c,
      ));
    const participants: RecordParticipant[] = toMatchResult(state, playedAt)
      .participants.filter((p) => !state.players.find((x) => x.id === p.participantId)?.ai)
      .map((p) => {
        const playerId = Number(p.participantId.slice(1));
        return { participantId: p.participantId, kind: 'player', playerId, memberIds: [playerId], place: p.place, score: p.score ?? 0 };
      });
    await recordMatch(householdId, { matchId: match.id, gameType: 'clovece', playedAt, participants }, c);
    return { status: 'recorded', matchId: match.id };
  });
}
