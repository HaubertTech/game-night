import { json, type RequestHandler } from '@sveltejs/kit';
import { tx } from '#lib/server/db.ts';
import { cleanAvatar, cleanName, fail, readJson, requireHousehold } from '#lib/server/http.ts';
import { createTeam, foreignPlayerIds, listTeams } from '#lib/server/repo/teams.ts';

export const GET: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  return json({ teams: await listTeams(household.id) });
};

export const POST: RequestHandler = async (event) => {
  const household = requireHousehold(event);
  const body = await readJson(event.request);
  const name = cleanName(body.name, 'Název týmu');
  const raw = body.member_ids;
  if (!Array.isArray(raw) || raw.length < 2 || !raw.every((id) => Number.isInteger(id) && id > 0)) {
    fail(400, 'Tým potřebuje aspoň dva hráče (member_ids).');
  }
  const memberIds = Array.from(new Set(raw as number[]));
  const team = await tx(async (client) => {
    if ((await foreignPlayerIds(household.id, memberIds, client)).length) return null;
    return createTeam(household.id, { name, avatar: cleanAvatar(body.avatar), member_ids: memberIds }, client);
  });
  if (!team) fail(400, 'Někteří hráči v týmu do domácnosti nepatří.');
  return json({ team }, { status: 201 });
};
