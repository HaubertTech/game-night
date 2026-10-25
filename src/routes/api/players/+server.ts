import { json, type RequestHandler } from '@sveltejs/kit';
import { cleanAvatar, cleanBirthYear, cleanName, fail, isLevel, LEVEL_LIST, readJson, requireHousehold } from '#lib/server/http.ts';
import { createPlayer, listPlayers } from '#lib/server/repo/players.ts';

export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const includeArchived = event.url.searchParams.get('archived') === '1';
  return json({ players: await listPlayers(household.id, { includeArchived }) });
};

export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request);
  const name = cleanName(body.name);
  if (!isLevel(body.level)) fail(400, `Úroveň musí být jedna z: ${LEVEL_LIST}.`);
  const player = await createPlayer(household.id, {
    name,
    level: body.level,
    avatar: cleanAvatar(body.avatar),
    birth_year: cleanBirthYear(body.birth_year) ?? null,
  });
  return json({ player }, { status: 201 });
};
