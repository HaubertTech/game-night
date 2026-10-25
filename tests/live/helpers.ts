// Synthetic question pools and shortcuts for live-mode tests.

import type { Level, Question, Theme } from '../../src/lib/types.ts';
import {
  stepTurn,
  type Actor,
  type LiveCommand,
  type LiveContestant,
  type LiveState,
  applyLive,
} from '../../src/lib/engine/live.ts';

export type QType = Question['type'];

/** `n` questions per level and theme, all of the given type (so a test knows what it gets). */
export function makePool(types: Partial<Record<Level, QType>>, themes: Theme[] = ['priroda', 'dejiny'], n = 4): Question[] {
  const out: Question[] = [];
  for (const [level, type] of Object.entries(types) as [Level, QType][]) {
    for (const theme of themes) {
      for (let i = 1; i <= n; i++) {
        const base = {
          id: `${level}-${theme}-${String(i).padStart(3, '0')}`,
          level,
          theme,
          text: `Otázka ${level} ${theme} ${i}?`,
          fact: `Fakt ${i}`,
          difficulty: 1 as const,
          status: 'verified' as const,
        };
        if (type === 'choice') out.push({ ...base, type, options: ['Ano', 'Ne', 'Možná'], answer: 'Ano' });
        else if (type === 'estimate') out.push({ ...base, type, answer: 100, unit: 'kg' });
        else out.push({ ...base, type, answer: 'Praha', accept: ['praha'] });
      }
    }
  }
  return out;
}

export const players: LiveContestant[] = [
  { id: 'tata', name: 'Táta', avatar: '🐻', level: 'hospoda', memberIds: ['tata'], onTv: false },
  { id: 'anicka', name: 'Anička', avatar: '🦊', level: 'lavice', memberIds: ['anicka'], onTv: false },
  { id: 'kuba', name: 'Kuba', avatar: '🐸', level: 'piskoviste', memberIds: ['kuba'], onTv: true },
];

export const HOST: Actor = { role: 'host' };
export const SYSTEM: Actor = { role: 'system' };
export const as = (contestantId: string): Actor => ({ role: 'contestant', contestantId });

/** Applies an action and throws when the engine refuses it. */
export function act(state: LiveState, command: LiveCommand, by: Actor = HOST, now = 1_000): LiveState {
  const r = applyLive(state, { ...command, by, now } as Parameters<typeof applyLive>[1]);
  if (!r.ok) throw new Error(`refused ${command.type}: ${r.error}`);
  return r.state;
}

/** A correct (or wrong) answer value for the contestant's question in the current step. */
export function valueFor(state: LiveState, contestantId: string, correct = true): string | number {
  const q = state.questions[stepTurn(state, contestantId)!.turn.questionId];
  if (q.type === 'choice') return correct ? q.answer : q.options.find((o) => o !== q.answer)!;
  if (q.type === 'estimate') return correct ? q.answer : q.answer * 10;
  return correct ? 'Praha' : 'Brno';
}
