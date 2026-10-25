import { json, type RequestHandler } from '@sveltejs/kit';
import { readJson, requireHousehold } from '#lib/server/http.ts';
import { service } from '#lib/server/services/api.ts';
import { createSeason, listSeasons } from '#lib/server/services/seasons.ts';
import { todayPrague } from '#lib/server/services/nights.ts';

export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const seasons = await listSeasons(household.id);
  const today = todayPrague();
  return json({ seasons, current: seasons.find((s) => s.starts_on <= today && s.ends_on >= today) ?? null });
};

/** Body: { name, starts_on, ends_on, points_table?: number[] } */
export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request);
  const season = await service(() =>
    createSeason(household.id, {
      name: typeof body.name === 'string' ? body.name : '',
      starts_on: String(body.starts_on ?? ''),
      ends_on: String(body.ends_on ?? ''),
      points_table: Array.isArray(body.points_table) ? body.points_table.map(Number) : undefined,
    }),
  );
  return json({ season }, { status: 201 });
};
