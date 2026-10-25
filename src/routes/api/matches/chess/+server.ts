import { json, type RequestHandler } from '@sveltejs/kit';
import { fail, readJson, requireHousehold } from '#lib/server/http.ts';
import { optionalId, service } from '#lib/server/services/api.ts';
import { recordTabletChess } from '#lib/server/services/chess.ts';

/**
 * A finished two-player chess game from one tablet. Body: { game: ChessState, white_id, black_id, night_id? }.
 * 200 { status: 'recorded' | 'already', match_id }. Games against the computer are refused.
 */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request);
  const whiteId = optionalId(body.white_id, 'id bílého hráče');
  const blackId = optionalId(body.black_id, 'id černého hráče');
  if (whiteId === null || blackId === null) fail(400, 'Chybí bílý nebo černý hráč.');
  const outcome = await service(() => recordTabletChess(household.id, { game: body.game, whiteId, blackId, nightId: optionalId(body.night_id, 'číslo večera') }));
  return json({ status: outcome.status, match_id: outcome.matchId });
};
