// Card score sheets (prší, žolíky) stored in matches.state. The server applies the reducer from
// src/lib/cards, so the sheet is the same on every device; finishing records the match.

import { createPrsi, reducePrsi, prsiToMatchResult, type PrsiAction, type PrsiState } from '../../cards/prsi.ts';
import {
  createZoliky,
  DEFAULT_ZOLIKY_SETTINGS,
  reduceZoliky,
  zolikySheet,
  zolikyToMatchResult,
  type ZolikyAction,
  type ZolikySettings,
  type ZolikyState,
} from '../../cards/zoliky.ts';
import type { MatchResult } from '../../league/types.ts';
import { one, query, tx, type Queryable } from '../db.ts';
import { createMatch, saveMatchState, type MatchStatus } from '../repo/matches.ts';
import { recordMatch, ResultError, type RecordCardRound } from './results.ts';

export type CardGameType = 'prsi' | 'zoliky';
export type CardState = PrsiState | ZolikyState;

export interface CardMatchInput {
  gameType: CardGameType;
  playerIds: number[];
  nightId?: number | null;
  settings?: Partial<ZolikySettings>;
}

export interface CardMatchView {
  id: number;
  game_type: CardGameType;
  night_id: number | null;
  status: MatchStatus;
  state: CardState;
}

function cleanSettings(raw: Partial<ZolikySettings> | undefined): Partial<ZolikySettings> {
  if (!raw) return {};
  const out: Partial<ZolikySettings> = {};
  if (raw.limit !== undefined) {
    if (raw.limit !== null && (!Number.isInteger(raw.limit) || raw.limit < 1 || raw.limit > 100000)) throw new ResultError('Limit musí být kladné celé číslo.');
    out.limit = raw.limit;
  }
  if (raw.limitMode !== undefined) {
    if (raw.limitMode !== 'endGame' && raw.limitMode !== 'eliminate') throw new ResultError('Neznámý režim limitu.');
    out.limitMode = raw.limitMode;
  }
  if (raw.maxRounds !== undefined) {
    if (raw.maxRounds !== null && (!Number.isInteger(raw.maxRounds) || raw.maxRounds < 1)) throw new ResultError('Počet kol musí být kladné celé číslo.');
    out.maxRounds = raw.maxRounds;
  }
  if (raw.lowerIsBetter !== undefined) out.lowerIsBetter = Boolean(raw.lowerIsBetter);
  if (raw.winnerScore !== undefined) {
    if (!Number.isInteger(raw.winnerScore)) throw new ResultError('Body za zavření musí být celé číslo.');
    out.winnerScore = raw.winnerScore;
  }
  if (raw.closeFromHand !== undefined) {
    const c = raw.closeFromHand;
    const mult = c.othersMultiplier ?? DEFAULT_ZOLIKY_SETTINGS.closeFromHand.othersMultiplier;
    const bonus = c.winnerBonus ?? DEFAULT_ZOLIKY_SETTINGS.closeFromHand.winnerBonus;
    if (!Number.isFinite(mult) || mult < 1 || mult > 10 || !Number.isInteger(bonus)) throw new ResultError('Neplatné pravidlo zavření z ruky.');
    out.closeFromHand = { othersMultiplier: mult, winnerBonus: bonus };
  }
  return out;
}

export async function createCardMatch(householdId: number, input: CardMatchInput): Promise<CardMatchView> {
  if (input.gameType !== 'prsi' && input.gameType !== 'zoliky') throw new ResultError('Neznámá karetní hra.');
  const ids = Array.from(new Set(input.playerIds));
  if (ids.length < 2) throw new ResultError('Karty hrají aspoň dva hráči.');
  if (ids.length > 10) throw new ResultError('Nejvýš deset hráčů.');
  const settings = input.gameType === 'zoliky' ? cleanSettings(input.settings) : {};
  return tx(async (c) => {
    const players = await query<{ id: number; name: string }>(
      'SELECT id, name FROM players WHERE household_id = $1 AND archived_at IS NULL AND id = ANY($2::bigint[])',
      [householdId, ids],
      c,
    );
    if (players.length !== ids.length) throw new ResultError('Někteří hráči do domácnosti nepatří nebo jsou archivovaní.');
    if (input.nightId != null) {
      const night = await one<{ status: string }>('SELECT status FROM game_nights WHERE household_id = $1 AND id = $2', [householdId, input.nightId], c);
      if (!night) throw new ResultError('Takový večer neexistuje.', 404);
      if (night.status !== 'open') throw new ResultError('Večer je už uzavřený.', 409);
    }
    const names = new Map(players.map((p) => [p.id, p.name]));
    const cardPlayers = ids.map((id) => ({ id: String(id), name: names.get(id)! }));
    const match = await createMatch(householdId, { game_type: input.gameType, night_id: input.nightId ?? null, status: 'running', started_at: new Date() }, c);
    const base = { id: String(match.id), createdAt: new Date().toISOString(), nightId: input.nightId == null ? null : String(input.nightId), players: cardPlayers };
    const state: CardState = input.gameType === 'prsi' ? createPrsi(base) : createZoliky({ ...base, settings });
    await saveMatchState(match.id, state, 'running', c);
    return { id: match.id, game_type: input.gameType, night_id: match.night_id, status: 'running', state };
  });
}

export async function getCardMatch(householdId: number, matchId: number, client?: Queryable): Promise<CardMatchView | null> {
  const row = await one<CardMatchView>(
    `SELECT id, game_type, night_id, status, state FROM matches WHERE household_id = $1 AND id = $2 AND game_type IN ('prsi', 'zoliky')`,
    [householdId, matchId],
    client,
  );
  return row && row.state ? row : null;
}

const PRSI_ACTIONS = new Set(['record', 'replaceLast', 'undo', 'finish', 'reopen']);
const ZOLIKY_ACTIONS = new Set(['addRound', 'undo', 'finish', 'reopen']);

/** Shape check of a client action; the reducer validates the content. */
export function parseCardAction(gameType: CardGameType, raw: unknown): PrsiAction | ZolikyAction {
  if (!raw || typeof raw !== 'object') throw new ResultError('Chybí akce.');
  const a = raw as Record<string, unknown>;
  const allowed = gameType === 'prsi' ? PRSI_ACTIONS : ZOLIKY_ACTIONS;
  if (typeof a.type !== 'string' || !allowed.has(a.type)) throw new ResultError('Neznámá akce.');
  if (a.type === 'record' || a.type === 'replaceLast') {
    if (!Array.isArray(a.order) || !a.order.every((x) => typeof x === 'string')) throw new ResultError('Pořadí musí být seznam hráčů.');
    return { type: a.type, order: a.order as string[] };
  }
  if (a.type === 'addRound') {
    if (typeof a.winnerId !== 'string' || !a.hand || typeof a.hand !== 'object') throw new ResultError('Chybí, kdo zavřel, nebo body.');
    const hand: Record<string, number> = {};
    for (const [k, v] of Object.entries(a.hand as Record<string, unknown>)) {
      if (typeof v !== 'number' || !Number.isInteger(v)) throw new ResultError('Body musí být celá čísla.');
      hand[k] = v;
    }
    return { type: 'addRound', winnerId: a.winnerId, hand, fromHand: a.fromHand === true };
  }
  return { type: a.type } as PrsiAction | ZolikyAction;
}

function cardRounds(state: ZolikyState): RecordCardRound[] {
  const rows: RecordCardRound[] = [];
  zolikySheet(state).rows.forEach((row, i) => {
    for (const [playerId, points] of Object.entries(row.scores)) rows.push({ roundNo: i + 1, playerId: Number(playerId), points });
  });
  return rows;
}

function toRecordParticipants(result: MatchResult) {
  return result.participants.map((p) => ({
    participantId: p.participantId,
    kind: 'player' as const,
    playerId: Number(p.participantId),
    memberIds: [Number(p.participantId)],
    place: p.place,
    score: p.score ?? 0,
  }));
}

/** Applies one action; `finish` also records the match (league points, ratings). */
export async function applyCardAction(householdId: number, matchId: number, rawAction: unknown): Promise<CardMatchView> {
  return tx(async (c) => {
    const match = await one<CardMatchView>(
      `SELECT id, game_type, night_id, status, state FROM matches WHERE household_id = $1 AND id = $2 AND game_type IN ('prsi', 'zoliky') FOR UPDATE`,
      [householdId, matchId],
      c,
    );
    if (!match || !match.state) throw new ResultError('Taková partie neexistuje.', 404);
    if (match.status === 'finished') throw new ResultError('Partie je už zapsaná.', 409);
    if (match.status === 'abandoned') throw new ResultError('Partie byla zrušená.', 409);
    const action = parseCardAction(match.game_type, rawAction);
    const next: CardState =
      match.game_type === 'prsi' ? reducePrsi(match.state as PrsiState, action as PrsiAction) : reduceZoliky(match.state as ZolikyState, action as ZolikyAction);
    if (next.error) return { ...match, state: next };
    await saveMatchState(matchId, next, 'running', c);
    if (action.type === 'finish') {
      const playedAt = new Date().toISOString();
      const result = match.game_type === 'prsi' ? prsiToMatchResult(next as PrsiState, playedAt) : zolikyToMatchResult(next as ZolikyState, playedAt);
      await recordMatch(
        householdId,
        {
          matchId,
          gameType: match.game_type,
          playedAt,
          participants: toRecordParticipants(result),
          cardRounds: match.game_type === 'zoliky' ? cardRounds(next as ZolikyState) : [],
        },
        c,
      );
      return { ...match, status: 'finished', state: next };
    }
    return { ...match, state: next };
  });
}

/** Drops an unfinished card match (written by mistake). */
export async function abandonCardMatch(householdId: number, matchId: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `UPDATE matches SET status = 'abandoned', updated_at = now()
      WHERE household_id = $1 AND id = $2 AND game_type IN ('prsi', 'zoliky') AND status IN ('lobby', 'running') RETURNING id`,
    [householdId, matchId],
  );
  return rows.length > 0;
}
