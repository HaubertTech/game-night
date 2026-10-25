// „Řekni, ukaž, nakresli“ in a live room. Teams are `t<teamId>`, players `p<playerId>`; the word
// cards come from data/aktivity/*.json (AKTIVITY_DIR overrides the directory).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import {
  aktivityToMatchResult,
  applyAktivity,
  viewFor,
  type AktivityAction,
  type AktivityCommand,
  type AktivityState,
} from '../../games/aktivity/engine.ts';
import type { AktivityCard } from '../../games/aktivity/types.ts';
import { PROTOCOL_VERSION } from '../../live/protocol.ts';
import type { RecordMatchInput, RecordParticipant } from '../services/results.ts';
import { memberPlayerIds, parseSeatId, type GameAdapter } from './types.ts';

export function defaultAktivityDir(): string {
  return resolve(process.env.AKTIVITY_DIR ?? join(process.cwd(), 'data', 'aktivity'));
}

/** Every card of data/aktivity/*.json; unreadable files are skipped with a warning. */
export function loadAktivityCards(dir: string = defaultAktivityDir()): AktivityCard[] {
  if (!existsSync(dir)) {
    console.warn('[aktivity] directory not found', { dir });
    return [];
  }
  const out: AktivityCard[] = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    try {
      const data = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (Array.isArray(data)) out.push(...(data as AktivityCard[]));
    } catch (err) {
      console.warn('[aktivity] skipping unreadable file', { file: name, err: (err as Error).message });
    }
  }
  return out;
}

export function aktivityRecordInput(matchId: number, state: AktivityState, playedAt: string): RecordMatchInput {
  const result = aktivityToMatchResult(state, playedAt);
  const participants: RecordParticipant[] = result.participants.map((p) => {
    const seat = parseSeatId(p.participantId);
    if (!seat || seat.kind !== 'team') throw new Error(`[aktivity] team id ${p.participantId} is not a DB team`);
    return {
      participantId: p.participantId,
      kind: 'team',
      teamId: seat.id,
      memberIds: memberPlayerIds(p.memberIds),
      place: p.place,
      score: p.score ?? 0,
    };
  });
  // Every revealed word was seen by everyone at the table.
  const seen = [...new Set(state.history.map((h) => h.cardId))];
  return { matchId, gameType: 'aktivity', playedAt, participants, seen };
}

export const aktivityAdapter: GameAdapter<AktivityState, AktivityCommand> = {
  game: 'aktivity',
  apply(state, command, by, now) {
    const result = applyAktivity(state, { ...command, by, now } as AktivityAction);
    return result.ok ? { ok: true, state: result.state } : { ok: false, error: result.error };
  },
  message(state, viewer, presence, now) {
    const me = viewer.role === 'contestant' ? viewer.contestantId : null;
    return {
      v: PROTOCOL_VERSION,
      type: 'gameState',
      game: 'aktivity',
      view: { ...viewFor(state, viewer), viewer: viewer.role, me },
      presence,
      now,
    };
  },
  timeoutAt: (state) => (state.phase === 'playing' ? state.deadline : null),
  timeout(state, now) {
    const result = applyAktivity(state, { type: 'timeout', by: { role: 'system' }, now });
    return result.ok ? result.state : null;
  },
  seats: (state) => state.teams.flatMap((t) => t.players.map((p) => ({ id: p.id, joinable: state.phase !== 'finished' }))),
  kicked: () => [],
  kickTarget: () => null,
  isLobby: (state) => state.phase === 'setup',
  isFinished: (state) => state.phase === 'finished',
  recordInput: aktivityRecordInput,
};
