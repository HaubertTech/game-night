import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson, requireHousehold } from '#lib/server/http.ts';
import { optionalId, service } from '#lib/server/services/api.ts';
import { recordTabletQuiz } from '#lib/server/services/quiz.ts';

/**
 * A finished tablet quiz. Body: { game: HistoryEntry, night_id?, create_missing?, profiles? }.
 * 200 { status: 'recorded' | 'already', match_id }; 409 { status: 'missing', missing } when some
 * tablet profiles have no server counterpart (send again with create_missing: true).
 */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request);
  const outcome = await service(() =>
    recordTabletQuiz(household.id, {
      game: body.game,
      nightId: optionalId(body.night_id, 'číslo večera'),
      createMissing: body.create_missing === true,
      profiles: Array.isArray(body.profiles) ? body.profiles : undefined,
    }),
  );
  if (outcome.status === 'missing') return json(outcome, { status: 409 });
  return json({ status: outcome.status, match_id: outcome.matchId });
};
