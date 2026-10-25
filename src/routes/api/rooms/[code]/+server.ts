import { json, type RequestHandler } from '@sveltejs/kit';
import type { LiveState } from '#lib/engine/live.ts';
import type { AktivityState } from '#lib/games/aktivity/engine.ts';
import type { ChessState } from '#lib/games/chess/engine.ts';
import type { MjzState } from '#lib/games/mjz/engine.ts';
import type { PrsiRoomState, ZolikyRoomState } from '#lib/live/table-games.ts';
import { chessPhase } from '#lib/server/games/chess.ts';
import { fail } from '#lib/server/http.ts';
import { getLiveHub } from '#lib/server/ws.ts';

/** Public room info for a phone: which game, who can still be picked. No answers, no tokens. */
export const GET: RequestHandler = async ({ params }) => {
  const code = (params.code ?? '').toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) fail(404, 'Místnost s tímto kódem neexistuje.');
  const hub = getLiveHub();
  const room = hub.rooms.getRoom(code);
  if (!room) fail(404, 'Místnost s tímto kódem neexistuje.');
  const presence = hub.rooms.presence(code);
  const state = room.state;
  const people = new Map<string, { name: string; avatar: string; level: string; onTv: boolean }>();
  const game = room.game ?? 'quiz';
  if (game === 'quiz') {
    for (const c of (state as LiveState).config.contestants) people.set(c.id, { name: c.name, avatar: c.avatar, level: c.level, onTv: c.onTv });
  } else if (game === 'aktivity') {
    for (const p of (state as AktivityState).teams.flatMap((t) => t.players)) people.set(p.id, { name: p.name, avatar: p.avatar ?? '🙂', level: p.level, onTv: false });
  } else if (game === 'mjz') {
    for (const c of (state as MjzState).contestants) people.set(c.id, { name: c.name, avatar: c.avatar, level: c.level, onTv: false });
  } else if (game === 'chess') {
    for (const p of Object.values((state as ChessState).players)) people.set(p.id, { name: p.name, avatar: p.avatar ?? '🙂', level: p.level ?? 'hospoda', onTv: false });
  } else {
    for (const s of (state as PrsiRoomState | ZolikyRoomState).seats) people.set(s.id, { name: s.name, avatar: s.avatar, level: s.level, onTv: false });
  }
  const phase = game === 'chess' ? chessPhase(state as ChessState) : (state as { phase: string }).phase;
  return json({
    code,
    game,
    phase,
    contestants: hub.rooms.seats(code).map((s) => {
      const p = people.get(s.id);
      return {
        id: s.id,
        name: p?.name ?? s.id,
        avatar: p?.avatar ?? '🙂',
        level: p?.level ?? 'hospoda',
        on_tv: p?.onTv ?? false,
        kicked: s.kicked,
        claimed: presence[s.id]?.claimed ?? false,
        online: presence[s.id]?.online ?? false,
      };
    }),
  });
};
