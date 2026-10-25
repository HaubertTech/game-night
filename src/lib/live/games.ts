// Games a live room (TV + phones) can host. Shared by the server, the protocol and the UI.

export const ROOM_GAMES = ['quiz', 'aktivity', 'mjz', 'chess', 'prsi-hra', 'zoliky-hra'] as const;
export type RoomGame = (typeof ROOM_GAMES)[number];

export const ROOM_GAME_LABELS: Record<RoomGame, string> = {
  quiz: 'Kvíz',
  aktivity: 'Řekni, ukaž, nakresli',
  mjz: 'Město, jméno, zvíře',
  chess: 'Šachy',
  'prsi-hra': 'Prší',
  'zoliky-hra': 'Žolíky',
};

export const ROOM_GAME_EMOJI: Record<RoomGame, string> = {
  quiz: '🦉',
  aktivity: '🎭',
  mjz: '✍️',
  chess: '♟️',
  'prsi-hra': '🃏',
  'zoliky-hra': '🂡',
};

export function isRoomGame(value: unknown): value is RoomGame {
  return typeof value === 'string' && (ROOM_GAMES as readonly string[]).includes(value);
}
