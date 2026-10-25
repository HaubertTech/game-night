import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson, requireHousehold } from '#lib/server/http.ts';
import { optionalId, service } from '#lib/server/services/api.ts';
import { createNight, listNights, openNightToday } from '#lib/server/services/nights.ts';

export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const seasonId = optionalId(event.url.searchParams.get('season'), 'číslo sezóny') ?? undefined;
  const [nights, today] = await Promise.all([listNights(household.id, { seasonId }), openNightToday(household.id)]);
  return json({ nights, today });
};

/** Body: { played_on?: 'YYYY-MM-DD', season_id?: number | null, title?: string } */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request);
  const night = await service(() =>
    createNight(household.id, {
      played_on: typeof body.played_on === 'string' && body.played_on ? body.played_on : undefined,
      season_id: body.season_id === undefined ? undefined : optionalId(body.season_id, 'číslo sezóny'),
      title: typeof body.title === 'string' ? body.title : null,
    }),
  );
  return json({ night }, { status: 201 });
};
