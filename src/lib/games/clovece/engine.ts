// Člověče, nezlob se as a pure reducer: plain JSON state, a seeded die (rng.ts) whose state
// travels with the game, commands with `by`/`now`. The same code runs on the tablet, on the server
// in a live room and in the tests; a finished game can be replayed from its seed and `history`.
//
// Board: a ring of 40 fields, every colour starts 10 fields after the previous one. A pawn's
// position is relative to its own start: -1 = yard (startovní domeček), 0–39 = ring, 40–43 = the
// four home fields (cílový domeček). Rules and sources: README.md next to this file.

import { mulberry32 } from '../../engine/rng.ts';
import type { MatchParticipant, MatchResult } from '../../league/types.ts';
import type { Level } from '../../types.ts';

export const CLOVECE_VERSION = 1;
export const TRACK = 40;
export const HOME = 4;
export const YARD = -1;
/** Last relative position (deepest home field). */
export const LAST = TRACK + HOME - 1;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const COLORS = ['red', 'blue', 'green', 'yellow'] as const;
export type CloveceColor = (typeof COLORS)[number];

/** First ring field of each colour (clockwise). */
export const START_FIELD: Record<CloveceColor, number> = { red: 0, blue: 10, green: 20, yellow: 30 };

export const COLOR_LABELS: Record<CloveceColor, string> = { red: 'červená', blue: 'modrá', green: 'zelená', yellow: 'žlutá' };
/** Shape on the pawn and the home fields, so colours are told apart without seeing colour. */
export const COLOR_SHAPES: Record<CloveceColor, 'circle' | 'square' | 'triangle' | 'diamond'> = {
  red: 'circle',
  blue: 'square',
  green: 'triangle',
  yellow: 'diamond',
};
export const SHAPE_LABELS = { circle: 'kolečko', square: 'čtvereček', triangle: 'trojúhelník', diamond: 'kosočtverec' } as const;

/** Colours used for 2, 3 and 4 players (two players sit opposite each other). */
export function colorsFor(count: number): CloveceColor[] {
  if (count === 2) return ['red', 'green'];
  return COLORS.slice(0, count) as CloveceColor[];
}

export type AiLevel = 1 | 2 | 3;

export interface CloveceSettings {
  /** Pawns per player: 4 (classic) or 2 (shorter game). */
  pawns: 2 | 4;
  /** Landing on an opponent sends it home. Off = pawns may share a field (small children). */
  capture: boolean;
  /** A one enters a pawn too (not only a six). */
  enterOnOne: boolean;
  /** Three tries for a six while no pawn is on the ring. */
  threeTries: boolean;
}

export const DEFAULT_SETTINGS: CloveceSettings = { pawns: 4, capture: true, enterOnOne: false, threeTries: true };

export interface ClovecePlayer {
  /** `p12` in DB rooms and league games, a local id on the tablet, `ai<n>` for a computer. */
  id: string;
  name: string;
  avatar?: string;
  level?: Level;
  color: CloveceColor;
  /** Computer strength; null = a person. */
  ai: AiLevel | null;
}

export type CloveceEvent =
  | { seq: number; type: 'roll'; playerId: string; value: number; canMove: boolean; triesLeft: number }
  | { seq: number; type: 'move'; playerId: string; pawn: number; from: number; to: number; value: number }
  | { seq: number; type: 'capture'; playerId: string; victimId: string; victimPawn: number; field: number }
  | { seq: number; type: 'done'; playerId: string; place: number };

export interface LastMove {
  seq: number;
  playerId: string;
  pawn: number;
  from: number;
  to: number;
  captured: { playerId: string; pawn: number; from: number } | null;
}

export interface CloveceState {
  game: 'clovece';
  v: typeof CLOVECE_VERSION;
  id: string;
  createdAt: string;
  nightId: string | null;
  seed: number;
  settings: CloveceSettings;
  players: ClovecePlayer[];
  /** pawns[i][k] = relative position of pawn k of player i. */
  pawns: number[][];
  phase: 'playing' | 'finished';
  /** Id of the player on turn. */
  turn: string;
  /** roll = waiting for the die, move = the die shows `dice` and a pawn must be chosen. */
  stage: 'roll' | 'move';
  /** Last rolled value (kept after a roll without a move, so the screen can show it). */
  dice: number | null;
  /** Rolls left in this turn (3 while waiting for a six, otherwise 1). */
  tries: number;
  /** State of the seeded die (mulberry32 step). */
  rng: number;
  /** Player ids in the order they brought all pawns home. */
  finished: string[];
  /** Increments whenever the turn passes to another player. */
  turnCount: number;
  seq: number;
  log: CloveceEvent[];
  lastMove: LastMove | null;
  /** Every accepted command (-1 = roll, k = move pawn k), for replay on the server. */
  history: number[];
  updatedAt: number;
}

export type Actor = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'system' };
export type CloveceCommand = { type: 'roll' } | { type: 'move'; pawn: number };
export type CloveceAction = CloveceCommand & { by: Actor; now: number };
export type CloveceError = 'forbidden' | 'wrongPhase' | 'notYourTurn' | 'rollFirst' | 'alreadyRolled' | 'illegalMove';
export type CloveceResult = { ok: true; state: CloveceState } | { ok: false; error: CloveceError; state: CloveceState };

export interface CloveceMove {
  pawn: number;
  from: number;
  to: number;
  kind: 'enter' | 'move' | 'home';
  /** Opponent sent home by this move. */
  captures: { playerId: string; pawn: number } | null;
}

const LOG_KEEP = 40;
const RNG_STEP = 0x6d2b79f5;

// ---------- board geometry ----------

/** Ring field (0–39) of a relative position on the ring, null in the yard or at home. */
export function fieldOf(color: CloveceColor, rel: number): number | null {
  if (rel < 0 || rel >= TRACK) return null;
  return (START_FIELD[color] + rel) % TRACK;
}

export function playerIndex(state: CloveceState, id: string): number {
  return state.players.findIndex((p) => p.id === id);
}

export function playerById(state: CloveceState, id: string): ClovecePlayer | undefined {
  return state.players.find((p) => p.id === id);
}

export function playerName(state: CloveceState, id: string): string {
  return playerById(state, id)?.name ?? id;
}

/** Pawns standing on a ring field: [player index, pawn index]. */
export function pawnsOnField(state: CloveceState, field: number): [number, number][] {
  const out: [number, number][] = [];
  state.players.forEach((p, i) => {
    state.pawns[i].forEach((rel, k) => {
      if (fieldOf(p.color, rel) === field) out.push([i, k]);
    });
  });
  return out;
}

export function isDone(state: CloveceState, index: number): boolean {
  return state.pawns[index].every((rel) => rel >= TRACK);
}

/** Has at least one pawn on the ring (the three tries apply only without one). */
export function hasPawnOnRing(state: CloveceState, index: number): boolean {
  return state.pawns[index].some((rel) => rel >= 0 && rel < TRACK);
}

function enterValues(settings: CloveceSettings): number[] {
  return settings.enterOnOne ? [1, 6] : [6];
}

/** Every legal move of a player with the given die. */
export function legalMoves(state: CloveceState, playerId: string, value: number): CloveceMove[] {
  const i = playerIndex(state, playerId);
  if (i < 0) return [];
  const me = state.players[i];
  const mine = state.pawns[i];
  const moves: CloveceMove[] = [];
  mine.forEach((rel, k) => {
    let to: number;
    if (rel === YARD) {
      if (!enterValues(state.settings).includes(value)) return;
      to = 0;
    } else {
      to = rel + value;
      if (to > LAST) return;
      // Inside the home a pawn may not jump over its own pawns.
      for (let r = Math.max(rel + 1, TRACK); r < to; r++) if (mine.includes(r)) return;
    }
    if (mine.some((r, j) => j !== k && r === to)) return;
    let captures: CloveceMove['captures'] = null;
    if (to < TRACK && state.settings.capture) {
      const field = fieldOf(me.color, to)!;
      const victim = pawnsOnField(state, field).find(([pi]) => pi !== i);
      if (victim) captures = { playerId: state.players[victim[0]].id, pawn: victim[1] };
    }
    moves.push({ pawn: k, from: rel, to, kind: rel === YARD ? 'enter' : to >= TRACK ? 'home' : 'move', captures });
  });
  return moves;
}

/** Moves the player on turn may choose now (empty unless a die waits to be used). */
export function currentMoves(state: CloveceState): CloveceMove[] {
  if (state.phase !== 'playing' || state.stage !== 'move' || state.dice === null) return [];
  return legalMoves(state, state.turn, state.dice);
}

/** One move per different outcome: entering is the same with any yard pawn, so only the first is kept. */
export function distinctMoves(moves: readonly CloveceMove[]): CloveceMove[] {
  return moves.filter((m, i) => m.kind !== 'enter' || moves.findIndex((x) => x.kind === 'enter') === i);
}

// ---------- die ----------

/** Value of the next roll and the die state after it (one mulberry32 step). */
export function peekRoll(rng: number): { value: number; rng: number } {
  return { value: Math.floor(mulberry32(rng)() * 6) + 1, rng: (rng + RNG_STEP) >>> 0 };
}

/** A copy whose next roll is `value` (lessons and tests set up a situation with a known die). */
export function withNextRoll(state: CloveceState, value: number): CloveceState {
  for (let rng = state.rng >>> 0, n = 0; n < 1000; n++, rng = (rng + 1) >>> 0) {
    if (peekRoll(rng).value === value) return { ...state, rng };
  }
  throw new Error(`[clovece] no die state for ${value}`);
}

// ---------- create ----------

export interface CreateCloveceInput {
  id: string;
  createdAt: string;
  seed: number;
  nightId?: string | null;
  settings?: Partial<CloveceSettings>;
  players: { id: string; name: string; avatar?: string; level?: Level; ai?: AiLevel | null }[];
  now?: number;
}

export function normalizeSettings(raw: Partial<CloveceSettings> = {}): CloveceSettings {
  return {
    pawns: raw.pawns === 2 ? 2 : 4,
    capture: raw.capture ?? DEFAULT_SETTINGS.capture,
    enterOnOne: raw.enterOnOne ?? DEFAULT_SETTINGS.enterOnOne,
    threeTries: raw.threeTries ?? DEFAULT_SETTINGS.threeTries,
  };
}

function triesFor(state: CloveceState, index: number): number {
  return state.settings.threeTries && !hasPawnOnRing(state, index) ? 3 : 1;
}

export function createCloveceGame(input: CreateCloveceInput): CloveceState {
  const n = input.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`[clovece] ${MIN_PLAYERS}–${MAX_PLAYERS} players, got ${n}`);
  const ids = new Set(input.players.map((p) => p.id));
  if (ids.size !== n) throw new Error('[clovece] duplicate player ids');
  const settings = normalizeSettings(input.settings);
  const colors = colorsFor(n);
  const players: ClovecePlayer[] = input.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    ...(p.avatar ? { avatar: p.avatar } : {}),
    ...(p.level ? { level: p.level } : {}),
    color: colors[i],
    ai: p.ai ?? null,
  }));
  const state: CloveceState = {
    game: 'clovece',
    v: CLOVECE_VERSION,
    id: input.id,
    createdAt: input.createdAt,
    nightId: input.nightId ?? null,
    seed: input.seed >>> 0,
    settings,
    players,
    pawns: players.map(() => Array.from({ length: settings.pawns }, () => YARD)),
    phase: 'playing',
    turn: players[0].id,
    stage: 'roll',
    dice: null,
    tries: 1,
    rng: input.seed >>> 0,
    finished: [],
    turnCount: 0,
    seq: 0,
    log: [],
    lastMove: null,
    history: [],
    updatedAt: input.now ?? 0,
  };
  return { ...state, tries: triesFor(state, 0) };
}

// ---------- reducer ----------

type EventInput = CloveceEvent extends infer E ? (E extends CloveceEvent ? Omit<E, 'seq'> : never) : never;

function push(state: CloveceState, event: EventInput): void {
  state.seq += 1;
  state.log = [...state.log, { ...event, seq: state.seq } as CloveceEvent].slice(-LOG_KEEP);
}

function actorId(by: Actor): string | null {
  return by.role === 'contestant' ? by.contestantId : null;
}

/** Passes the turn to the next player still playing; ends the game when one is left. */
function nextTurn(state: CloveceState): void {
  const n = state.players.length;
  const playing = state.players.filter((_, i) => !isDone(state, i));
  if (playing.length <= 1) {
    for (const p of playing) {
      state.finished = [...state.finished, p.id];
      push(state, { type: 'done', playerId: p.id, place: state.finished.length });
    }
    state.phase = 'finished';
    state.stage = 'roll';
    state.tries = 0;
    return;
  }
  let i = playerIndex(state, state.turn);
  do i = (i + 1) % n;
  while (isDone(state, i));
  state.turn = state.players[i].id;
  state.turnCount += 1;
  state.stage = 'roll';
  state.tries = triesFor(state, i);
}

function clone(state: CloveceState): CloveceState {
  return { ...state, pawns: state.pawns.map((p) => [...p]) };
}

export function applyClovece(state: CloveceState, action: CloveceAction): CloveceResult {
  const fail = (error: CloveceError): CloveceResult => ({ ok: false, error, state });
  if (state.phase !== 'playing') return fail('wrongPhase');
  const actor = actorId(action.by);
  if (action.by.role === 'contestant') {
    if (playerIndex(state, actor!) < 0) return fail('forbidden');
    if (actor !== state.turn) return fail('notYourTurn');
  }
  const s = clone(state);
  const i = playerIndex(s, s.turn);
  const me = s.players[i];
  s.updatedAt = action.now;

  if (action.type === 'roll') {
    if (s.stage !== 'roll') return fail('alreadyRolled');
    const { value, rng } = peekRoll(s.rng);
    s.rng = rng;
    s.dice = value;
    s.tries -= 1;
    s.history = [...s.history, -1];
    const moves = legalMoves(s, me.id, value);
    if (moves.length > 0) {
      s.stage = 'move';
      push(s, { type: 'roll', playerId: me.id, value, canMove: true, triesLeft: s.tries });
      return { ok: true, state: s };
    }
    if (value === 6) s.tries = triesFor(s, i);
    push(s, { type: 'roll', playerId: me.id, value, canMove: false, triesLeft: s.tries });
    if (s.tries <= 0) nextTurn(s);
    return { ok: true, state: s };
  }

  if (s.stage !== 'move' || s.dice === null) return fail('rollFirst');
  if (!Number.isInteger(action.pawn)) return fail('illegalMove');
  const move = legalMoves(s, me.id, s.dice).find((m) => m.pawn === action.pawn);
  if (!move) return fail('illegalMove');
  const value = s.dice;
  s.history = [...s.history, move.pawn];
  s.pawns[i][move.pawn] = move.to;
  push(s, { type: 'move', playerId: me.id, pawn: move.pawn, from: move.from, to: move.to, value });
  let captured: LastMove['captured'] = null;
  if (move.captures) {
    const vi = playerIndex(s, move.captures.playerId);
    const from = s.pawns[vi][move.captures.pawn];
    s.pawns[vi][move.captures.pawn] = YARD;
    captured = { playerId: move.captures.playerId, pawn: move.captures.pawn, from };
    push(s, { type: 'capture', playerId: me.id, victimId: move.captures.playerId, victimPawn: move.captures.pawn, field: fieldOf(me.color, move.to)! });
  }
  s.lastMove = { seq: s.seq, playerId: me.id, pawn: move.pawn, from: move.from, to: move.to, captured };
  if (isDone(s, i)) {
    s.finished = [...s.finished, me.id];
    push(s, { type: 'done', playerId: me.id, place: s.finished.length });
    nextTurn(s);
    return { ok: true, state: s };
  }
  if (value === 6) {
    // A six rolls again.
    s.stage = 'roll';
    s.tries = triesFor(s, i);
    return { ok: true, state: s };
  }
  nextTurn(s);
  return { ok: true, state: s };
}

/** Replays a game from its seed and history (server-side check of a tablet game). */
export function replayClovece(input: CreateCloveceInput, history: readonly number[]): CloveceState {
  let s = createCloveceGame(input);
  for (const [n, h] of history.entries()) {
    const command: CloveceCommand = h === -1 ? { type: 'roll' } : { type: 'move', pawn: h };
    const r = applyClovece(s, { ...command, by: { role: 'system' }, now: n });
    if (!r.ok) throw new Error(`[clovece] replay refused step ${n}: ${r.error}`);
    s = r.state;
  }
  return s;
}

export const ERROR_TEXTS: Record<CloveceError, string> = {
  forbidden: 'Za tohohle hráče nehraješ.',
  wrongPhase: 'Hra už skončila.',
  notYourTurn: 'Počkej, teď hraje někdo jiný.',
  rollFirst: 'Nejdřív hoď kostkou.',
  alreadyRolled: 'Už máš hozeno — vyber figurku.',
  illegalMove: 'S touhle figurkou teď táhnout nejde.',
};

// ---------- view and result ----------

export type CloveceViewer = { role: 'host' } | { role: 'contestant'; contestantId: string } | { role: 'spectator' };

/** Everything on a board game is public except the die state (it would tell the next roll). */
export type CloveceView = Omit<CloveceState, 'rng' | 'history' | 'seed'> & {
  me: string | null;
  myColor: CloveceColor | null;
  /** Legal moves of the player on turn (entering listed once), for highlighting pawns and targets. */
  moves: CloveceMove[];
  places: Record<string, number>;
};

export function placesOf(state: CloveceState): Record<string, number> {
  return Object.fromEntries(state.finished.map((id, i) => [id, i + 1]));
}

export function viewFor(state: CloveceState, viewer: CloveceViewer): CloveceView {
  const me = viewer.role === 'contestant' ? viewer.contestantId : null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rng, history, seed, ...rest } = state;
  return {
    ...rest,
    pawns: state.pawns.map((p) => [...p]),
    me,
    myColor: me ? (playerById(state, me)?.color ?? null) : null,
    moves: distinctMoves(currentMoves(state)),
    places: placesOf(state),
  };
}

/** Pawns at home (the score shown in the league). */
export function homeCount(state: Pick<CloveceState, 'pawns'>, index: number): number {
  return state.pawns[index].filter((r) => r >= TRACK).length;
}

export function toMatchResult(state: CloveceState, playedAt: string = state.createdAt): MatchResult {
  if (state.phase !== 'finished') throw new Error('[clovece] game is not finished');
  const places = placesOf(state);
  const participants: MatchParticipant[] = state.players.map((p, i) => ({
    participantId: p.id,
    kind: 'player',
    memberIds: [p.id],
    place: places[p.id],
    score: homeCount(state, i),
  }));
  return { matchId: state.id, gameType: 'clovece', playedAt, nightId: state.nightId, participants };
}
