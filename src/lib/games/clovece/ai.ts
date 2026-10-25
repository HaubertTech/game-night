// Computer players for Člověče, nezlob se in three levels, deterministic for a given state:
//   1 = a random legal move (the choice comes from the die state, so a seed replays the game),
//   2 = heuristic: capture, run from danger, get home, enter, otherwise the furthest pawn,
//   3 = careful: like 2, but counts every opponent that could hit the target field and keeps
//       pawns out of reach when it can.
// `adviseClovece` gives the same choice with a short Czech sentence why (the owl's „Poraď“).

import { mulberry32 } from '../../engine/rng.ts';
import {
  applyClovece,
  currentMoves,
  fieldOf,
  playerIndex,
  playerName,
  TRACK,
  YARD,
  START_FIELD,
  type AiLevel,
  type CloveceCommand,
  type CloveceMove,
  type CloveceState,
} from './engine.ts';

export const AI_LEVEL_LABELS: Record<AiLevel, string> = { 1: 'Začátečník', 2: 'Hráč', 3: 'Opatrný' };

export interface CloveceAdvice {
  command: CloveceCommand;
  /** Pawn and target the advice is about (null for a roll). */
  move: CloveceMove | null;
  reason: string;
}

/**
 * How many opponent pawns could land on this ring field with one roll: pawns 1–6 fields behind it
 * that still go round the ring there, and yard pawns of the colour that starts on it (a six enters
 * onto that field). Zero when capturing is off.
 */
export function threatsTo(state: CloveceState, ownerIndex: number, field: number, ignore?: { player: number; pawn: number }): number {
  if (!state.settings.capture) return 0;
  let n = 0;
  state.players.forEach((p, i) => {
    if (i === ownerIndex) return;
    state.pawns[i].forEach((rel, k) => {
      if (ignore && ignore.player === i && ignore.pawn === k) return;
      if (rel === YARD) {
        if (START_FIELD[p.color] === field) n += 1;
        return;
      }
      const at = fieldOf(p.color, rel);
      if (at === null) return;
      const dist = (field - at + TRACK) % TRACK;
      if (dist >= 1 && dist <= 6 && rel + dist < TRACK) n += 1;
    });
  });
  return n;
}

interface Scored {
  move: CloveceMove;
  score: number;
  reason: string;
}

function scoreMove(state: CloveceState, move: CloveceMove, careful: boolean): Scored {
  const i = playerIndex(state, state.turn);
  const color = state.players[i].color;
  let score = move.to / 10;
  let reason = 'Posuň figurku, která je nejdál vpředu — bude dřív doma.';
  const fromField = move.from >= 0 ? fieldOf(color, move.from) : null;
  const toField = fieldOf(color, move.to);
  const ignore = move.captures ? { player: playerIndex(state, move.captures.playerId), pawn: move.captures.pawn } : undefined;
  const dangerNow = fromField === null ? 0 : threatsTo(state, i, fromField);
  const dangerAfter = toField === null ? 0 : threatsTo(state, i, toField, ignore);

  if (move.captures) {
    const vi = playerIndex(state, move.captures.playerId);
    const victimProgress = state.pawns[vi][move.captures.pawn];
    score += 60 + victimProgress / 2;
    reason = `Vyhoď figurku hráče ${playerName(state, move.captures.playerId)} — musí se vrátit na start!`;
  } else if (move.kind === 'home') {
    score += move.from < TRACK ? 45 : 8;
    reason = move.from < TRACK ? 'Dojdi do domečku — přesně to vychází a tam už je figurka v bezpečí.' : 'Posuň figurku v domečku hlouběji, uvolníš místo dalším.';
  } else if (move.kind === 'enter') {
    score += 35;
    reason = 'Šestka! Nasaď novou figurku na start.';
  } else if (dangerNow > 0 && dangerAfter === 0) {
    score += 25 + move.from / 4;
    reason = 'Uteč s figurkou — kousek za ní číhá soupeř a mohl by ji vyhodit.';
  }
  if (careful) {
    score -= dangerAfter * 18;
    if (dangerNow > 0) score += dangerNow * 6;
    // Leaving the own start field free lets the next pawn enter.
    if (move.from === 0 && state.pawns[i].includes(YARD)) score += 4;
    if (!move.captures && move.kind === 'move' && dangerAfter === 0 && dangerNow === 0 && move.to >= TRACK - 8) {
      score += 5;
      reason = 'Posuň figurku, která je kousek před domečkem a nikdo na ni nedosáhne.';
    }
  } else {
    score -= dangerAfter * 6;
  }
  if (!move.captures && move.kind === 'move' && dangerAfter > 0 && dangerNow === 0 && reason.startsWith('Posuň')) {
    reason = 'Posuň figurku, která je nejdál — ale pozor, soupeř je blízko.';
  }
  return { move, score, reason };
}

/** Advice for the player on turn: a roll, or the move the computer of this level would play. */
export function adviseClovece(state: CloveceState, level: AiLevel): CloveceAdvice {
  if (state.stage === 'roll') return { command: { type: 'roll' }, move: null, reason: 'Hoď kostkou.' };
  const moves = currentMoves(state);
  if (moves.length === 0) return { command: { type: 'roll' }, move: null, reason: 'Hoď kostkou.' };
  if (level === 1) {
    const rand = mulberry32((state.rng ^ 0x5bd1e995 ^ state.seq) >>> 0);
    const move = moves[Math.floor(rand() * moves.length)];
    return { command: { type: 'move', pawn: move.pawn }, move, reason: 'Táhni kteroukoli zvýrazněnou figurkou.' };
  }
  const scored = moves.map((m) => scoreMove(state, m, level === 3));
  let best = scored[0];
  for (const s of scored) if (s.score > best.score + 1e-9) best = s;
  if (moves.length === 1) best = { ...best, reason: `Jde jen jedna figurka. ${best.reason}` };
  return { command: { type: 'move', pawn: best.move.pawn }, move: best.move, reason: best.reason };
}

/** One computer command for the player on turn (refusal = bug in the AI, so it throws). */
export function cloveceAiStep(state: CloveceState, now: number, level?: AiLevel): CloveceState {
  const seat = state.players.find((p) => p.id === state.turn);
  const advice = adviseClovece(state, level ?? seat?.ai ?? 2);
  const r = applyClovece(state, { ...advice.command, by: { role: 'system' }, now });
  if (!r.ok) throw new Error(`[clovece-ai] refused ${JSON.stringify(advice.command)}: ${r.error}`);
  return r.state;
}

/** Plays the whole game with the computer on every seat (levels from the seats, default 2). */
export function autoplayClovece(state: CloveceState, maxSteps = 100000): CloveceState {
  let s = state;
  for (let n = 0; n < maxSteps && s.phase !== 'finished'; n++) s = cloveceAiStep(s, n);
  return s;
}
