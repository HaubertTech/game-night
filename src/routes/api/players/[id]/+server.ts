import { json, type RequestHandler } from '@sveltejs/kit';
import { cleanAvatar, cleanBirthYear, cleanName, fail, isLevel, parseId, readJson, requireHousehold } from '#lib/server/http.ts';
import { archivePlayer, updatePlayer, type PlayerPatch } from '#lib/server/repo/players.ts';

export const PATCH: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const id = parseId(event.params.id, 'hráč');
  const body = await readJson(event.request);
  const patch: PlayerPatch = {};
  if (body.name !== undefined) patch.name = cleanName(body.name);
  if (body.avatar !== undefined) patch.avatar = cleanAvatar(body.avatar) ?? '🙂';
  if (body.level !== undefined) {
    if (!isLevel(body.level)) fail(400, 'Úroveň musí být hospoda, lavice nebo piskoviste.');
    patch.level = body.level;
  }
  if (body.birth_year !== undefined) patch.birth_year = cleanBirthYear(body.birth_year) ?? null;
  const player = await updatePlayer(household.id, id, patch);
  if (!player) fail(404, 'Takový hráč neexistuje.');
  return json({ player });
};

/** Archives the player; past games and statistics stay. */
export const DELETE: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const id = parseId(event.params.id, 'hráč');
  const player = await archivePlayer(household.id, id);
  if (!player) fail(404, 'Takový hráč neexistuje.');
  return json({ player });
};
