// Runs computer turns through the reducers: the UI uses it for the computer seats, tests to
// play whole games. A refused command is a bug in the AI, so it throws instead of looping.

import { applyPrsi, type AiLevel, type PrsiGameState } from '../prsi-engine.ts';
import { applyZoliky, type ZolikyGameState } from '../zoliky-engine.ts';
import { choosePrsiMove } from './prsi-ai.ts';
import { chooseZolikyCommand } from './zoliky-ai.ts';

export function prsiAiStep(state: PrsiGameState, now: number, level?: AiLevel): PrsiGameState {
  const id = state.turn;
  const seat = state.players.find((p) => p.id === id);
  const advice = choosePrsiMove(state, id, level ?? seat?.ai ?? 2);
  const result = applyPrsi(state, { ...advice.move, by: { role: 'contestant', contestantId: id }, now });
  if (!result.ok) throw new Error(`[prsi-ai] refused ${JSON.stringify(advice.move)}: ${result.error}`);
  return result.state;
}

export function zolikyAiStep(state: ZolikyGameState, now: number, level?: AiLevel): ZolikyGameState {
  const id = state.turn;
  const seat = state.players.find((p) => p.id === id);
  const advice = chooseZolikyCommand(state, id, level ?? seat?.ai ?? 2);
  const result = applyZoliky(state, { ...advice.command, by: { role: 'contestant', contestantId: id }, now });
  if (!result.ok) throw new Error(`[zoliky-ai] refused ${JSON.stringify(advice.command)}: ${result.error} ${result.detail ?? ''}`);
  return result.state;
}

/** Plays a whole prší game with every seat run by the AI (levels from the seats, default 2). */
export function autoplayPrsi(state: PrsiGameState, maxSteps = 20000): PrsiGameState {
  let s = state;
  for (let i = 0; i < maxSteps && s.phase !== 'finished'; i++) {
    if (s.phase === 'dealEnd') {
      const r = applyPrsi(s, { type: 'nextDeal', by: { role: 'host' }, now: i });
      if (!r.ok) throw new Error(`[prsi-ai] nextDeal refused: ${r.error}`);
      s = r.state;
      continue;
    }
    s = prsiAiStep(s, i);
  }
  return s;
}

export function autoplayZoliky(state: ZolikyGameState, maxSteps = 200000): ZolikyGameState {
  let s = state;
  for (let i = 0; i < maxSteps && s.phase !== 'finished'; i++) {
    if (s.phase === 'roundEnd') {
      const r = applyZoliky(s, { type: 'nextRound', by: { role: 'host' }, now: i });
      if (!r.ok) throw new Error(`[zoliky-ai] nextRound refused: ${r.error}`);
      s = r.state;
      continue;
    }
    s = zolikyAiStep(s, i);
  }
  return s;
}
