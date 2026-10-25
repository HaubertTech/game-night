// Shapes of the table games in live rooms (chess, digital prší and žolíky, Člověče, nezlob se): room states, the
// views a screen receives and the commands a client may send. Types and parsers only, so the
// protocol, the server adapters and the UI share them without pulling in server code.

import type { ChessColor, ChessState } from '../games/chess/engine.ts';
import type { CloveceCommand, CloveceState, CloveceView } from '../games/clovece/engine.ts';
import { MARIAS_SUITS, type MariasSuit } from '../games/karty-hra/cards.ts';
import type { AiLevel, PrsiCommand, PrsiGameState, PrsiView } from '../games/karty-hra/prsi-engine.ts';
import type { ZolikyCommand, ZolikyGameState, ZolikyView } from '../games/karty-hra/zoliky-engine.ts';
import type { Level } from '../types.ts';

type ViewerRole = 'host' | 'contestant' | 'spectator';

// ---------- chess ----------

export type ChessRoomCommand =
  | { type: 'move'; uci: string }
  | { type: 'offerDraw' }
  | { type: 'acceptDraw' }
  | { type: 'declineDraw' }
  | { type: 'resign' };

/** The whole position is public; `color` = the side this phone plays (null for the TV and spectators). */
export interface ChessRoomView {
  viewer: ViewerRole;
  /** lobby = no move yet. */
  phase: 'lobby' | 'playing' | 'finished';
  me: string | null;
  color: ChessColor | null;
  game: ChessState;
}

// ---------- cards ----------

/** One seat at the card table: a household player (`p<id>`) or a computer (`ai<n>`). */
export interface TableSeat {
  id: string;
  name: string;
  avatar: string;
  level: Level;
  /** Computer strength; null = a person on a phone. */
  ai: AiLevel | null;
  /** Hints for children on this player's phone. */
  hints: boolean;
}

export interface CardRoomBase {
  seats: TableSeat[];
  /** The host started the game; before that phones only join. */
  started: boolean;
  /** Seconds for a person's turn; null = no limit (default). */
  turnSeconds: number | null;
  /** Pause before a computer move, so the table can follow it. */
  aiDelayMs: number;
  /** Server epoch ms of the next server move: a computer move or a person's timed-out turn. */
  nextAt: number | null;
  nextKind: 'ai' | 'turn' | null;
  /** Turn the scheduled move belongs to (a turn keeps its deadline across its own commands). */
  turnKey: string | null;
}

export interface PrsiRoomState extends CardRoomBase {
  game: 'prsi-hra';
  phase: 'lobby' | PrsiGameState['phase'];
  table: PrsiGameState;
}

export interface ZolikyRoomState extends CardRoomBase {
  game: 'zoliky-hra';
  phase: 'lobby' | ZolikyGameState['phase'];
  table: ZolikyGameState;
}

interface CardRoomViewBase {
  viewer: ViewerRole;
  me: string | null;
  started: boolean;
  seats: TableSeat[];
  /** End of the current person's turn (server clock), null = untimed or a computer moves. */
  deadline: number | null;
  turnSeconds: number | null;
}

export type PrsiRoomView = PrsiView &
  CardRoomViewBase & {
    roomPhase: PrsiRoomState['phase'];
    /** Only for the own seat with hints on and on its turn. */
    hint: { text: string; cardId: string | null } | null;
  };

export type ZolikyRoomView = ZolikyView &
  CardRoomViewBase & {
    roomPhase: ZolikyRoomState['phase'];
    hint: {
      text: string;
      /** Cards the advice is about. */
      cardIds: string[];
      /** Combinations for the first lay-down (null = not enough yet) and any other lay-down. */
      opening: string[][] | null;
      melds: string[][];
    } | null;
  };

export type PrsiRoomCommand = PrsiCommand | { type: 'start' };

// ---------- Člověče, nezlob se ----------

/** Seats like at the card table (people `p<id>`, computers `ai<n>`); `table` is the board. */
export interface CloveceRoomState extends CardRoomBase {
  game: 'clovece';
  phase: 'lobby' | CloveceState['phase'];
  table: CloveceState;
}

export type CloveceRoomView = CloveceView &
  CardRoomViewBase & {
    roomPhase: CloveceRoomState['phase'];
    /** Owl's advice for the own seat with hints on and on its turn: pawn to move and why. */
    hint: { text: string; pawn: number | null } | null;
  };

export type CloveceRoomCommand = CloveceCommand | { type: 'start' };
export type ZolikyRoomCommand = ZolikyCommand | { type: 'start' };

// ---------- parsers ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCardId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 24;
const cardList = (v: unknown, max = 20): string[] | null => (Array.isArray(v) && v.length > 0 && v.length <= max && v.every(isCardId) ? (v as string[]) : null);

export function parseChessRoomCommand(raw: unknown): ChessRoomCommand | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'move':
      return typeof raw.uci === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(raw.uci) ? { type: 'move', uci: raw.uci } : null;
    case 'offerDraw':
    case 'acceptDraw':
    case 'declineDraw':
    case 'resign':
      return { type: raw.type };
    default:
      return null;
  }
}

export function parsePrsiRoomCommand(raw: unknown): PrsiRoomCommand | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'start':
    case 'draw':
    case 'stand':
    case 'nextDeal':
      return { type: raw.type };
    case 'play': {
      if (!isCardId(raw.cardId)) return null;
      if (raw.suit === undefined) return { type: 'play', cardId: raw.cardId };
      return (MARIAS_SUITS as readonly unknown[]).includes(raw.suit) ? { type: 'play', cardId: raw.cardId, suit: raw.suit as MariasSuit } : null;
    }
    default:
      return null;
  }
}

export function parseCloveceRoomCommand(raw: unknown): CloveceRoomCommand | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'start':
    case 'roll':
      return { type: raw.type };
    case 'move':
      return Number.isInteger(raw.pawn) && (raw.pawn as number) >= 0 && (raw.pawn as number) < 4 ? { type: 'move', pawn: raw.pawn as number } : null;
    default:
      return null;
  }
}

export function parseZolikyRoomCommand(raw: unknown): ZolikyRoomCommand | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'start':
    case 'drawStock':
    case 'takeDiscard':
    case 'resetTurn':
    case 'nextRound':
      return { type: raw.type };
    case 'meld': {
      if (!Array.isArray(raw.melds) || raw.melds.length === 0 || raw.melds.length > 8) return null;
      const melds = raw.melds.map((m) => cardList(m, 14));
      return melds.every((m): m is string[] => m !== null) ? { type: 'meld', melds } : null;
    }
    case 'layOff':
    case 'swapJoker': {
      const cardIds = cardList(raw.cardIds, 14);
      return typeof raw.meldId === 'string' && raw.meldId.length <= 24 && cardIds ? { type: raw.type, meldId: raw.meldId, cardIds } : null;
    }
    case 'discard':
      return isCardId(raw.cardId) ? { type: 'discard', cardId: raw.cardId } : null;
    default:
      return null;
  }
}
