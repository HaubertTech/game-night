// „Město, jméno, zvíře“ in a live room. Hints for the review come from data/mjz/hints/*.json,
// read with node:fs (the Vite bundle in hints-data.ts is not available to `node server.ts`).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { applyMjz, toMatchResult, type MjzAction, type MjzCommand, type MjzState } from '../../games/mjz/engine.ts';
import { buildHintIndex, type HintFile, type HintIndex } from '../../games/mjz/hints.ts';
import { viewFor } from '../../games/mjz/view.ts';
import { PROTOCOL_VERSION } from '../../live/protocol.ts';
import type { RecordMatchInput, RecordParticipant } from '../services/results.ts';
import { memberPlayerIds, parseSeatId, type GameAdapter } from './types.ts';

export function defaultMjzHintsDir(): string {
  return resolve(process.env.MJZ_HINTS_DIR ?? join(process.cwd(), 'data', 'mjz', 'hints'));
}

export function loadMjzHintFiles(dir: string = defaultMjzHintsDir()): HintFile[] {
  if (!existsSync(dir)) return [];
  const out: HintFile[] = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    try {
      out.push(JSON.parse(readFileSync(join(dir, name), 'utf8')) as HintFile);
    } catch (err) {
      console.warn('[mjz] skipping unreadable hint file', { file: name, err: (err as Error).message });
    }
  }
  return out;
}

let hints: HintIndex | null = null;

/** Hint index loaded once per process. */
export function mjzHints(): HintIndex {
  hints ??= buildHintIndex(loadMjzHintFiles());
  return hints;
}

export function mjzRecordInput(matchId: number, state: MjzState, playedAt: string): RecordMatchInput {
  const kicked = new Set(state.kicked);
  const ranked = toMatchResult(state, { playedAt }).participants.filter((p) => !kicked.has(p.participantId));
  const participants: RecordParticipant[] = [];
  let place = 0;
  let prev: number | null = null;
  ranked.forEach((p, i) => {
    const score = p.score ?? 0;
    if (prev === null || score !== prev) place = i + 1;
    prev = score;
    const seat = parseSeatId(p.participantId);
    if (!seat) throw new Error(`[mjz] contestant id ${p.participantId} is not a DB id`);
    participants.push({
      participantId: p.participantId,
      kind: seat.kind,
      ...(seat.kind === 'player' ? { playerId: seat.id } : { teamId: seat.id }),
      memberIds: seat.kind === 'player' ? [seat.id] : memberPlayerIds(p.memberIds),
      place,
      score,
    });
  });
  return { matchId, gameType: 'mjz', playedAt, participants };
}

export const mjzAdapter: GameAdapter<MjzState, MjzCommand> = {
  game: 'mjz',
  apply(state, command, by, now) {
    const result = applyMjz(state, { ...command, by, now } as MjzAction);
    return result.ok ? { ok: true, state: result.state } : { ok: false, error: result.error };
  },
  message(state, viewer, presence, now) {
    return { v: PROTOCOL_VERSION, type: 'gameState', game: 'mjz', view: viewFor(state, viewer, { hints: mjzHints() }), presence, now };
  },
  timeoutAt: (state) => (state.phase === 'writing' ? state.deadline : null),
  timeout(state, now) {
    const result = applyMjz(state, { type: 'timeout', by: { role: 'system' }, now });
    return result.ok ? result.state : null;
  },
  seats: (state) => state.contestants.map((c) => ({ id: c.id, joinable: state.phase !== 'finished' })),
  kicked: (state) => state.kicked,
  kickTarget: (command) => (command.type === 'kick' ? command.contestantId : null),
  isLobby: (state) => state.phase === 'setup',
  isFinished: (state) => state.phase === 'finished',
  recordInput: mjzRecordInput,
};
