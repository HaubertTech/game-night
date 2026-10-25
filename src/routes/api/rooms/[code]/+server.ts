import { json, type RequestHandler } from '@sveltejs/kit';
import { fail } from '#lib/server/http.ts';
import { getLiveHub } from '#lib/server/ws.ts';

/** Public room info for a phone: who can still be picked. No answers, no tokens. */
export const GET: RequestHandler = async ({ params }) => {
  const code = (params.code ?? '').toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) fail(404, 'Místnost s tímto kódem neexistuje.');
  const hub = getLiveHub();
  const room = hub.rooms.getRoom(code);
  if (!room) fail(404, 'Místnost s tímto kódem neexistuje.');
  const presence = hub.rooms.presence(code);
  const state = room.state;
  return json({
    code,
    phase: state.phase,
    contestants: state.config.contestants.map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      level: c.level,
      on_tv: c.onTv,
      kicked: state.kicked.includes(c.id),
      claimed: presence[c.id]?.claimed ?? false,
      online: presence[c.id]?.online ?? false,
    })),
  });
};
