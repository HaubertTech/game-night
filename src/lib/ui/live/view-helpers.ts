// Small helpers that turn a LiveView into what the shared tablet components expect.

import type { Standing } from '../../engine/quiz.ts';
import type { ContestantView, LiveView, RevealedAnswer } from '../../live/protocol.ts';
import type { Question } from '../../types.ts';
import { deviationLabel, formatEstimate } from '../labels.ts';

export function contestantMap(view: LiveView): Map<string, ContestantView> {
  return new Map(view.contestants.map((c) => [c.id, c]));
}

/** Rows for Standings.svelte (kicked contestants are left out). */
export function standingRows(view: LiveView): Standing[] {
  const byId = contestantMap(view);
  return view.standings
    .filter((s) => byId.has(s.contestantId) && !byId.get(s.contestantId)!.kicked)
    .map((s) => {
      const c = byId.get(s.contestantId)!;
      return {
        contestant: { id: c.id, name: c.name, avatar: c.avatar, level: c.level, memberIds: [] },
        score: s.score,
        roundPoints: s.roundPoints,
        place: s.place,
      };
    });
}

function unitSuffix(unit: string): string {
  return unit.trim().toLowerCase() === 'rok' ? '' : ` ${unit}`;
}

export function correctAnswerText(q: Question): string {
  if (q.type === 'estimate') return `${formatEstimate(q.answer, q.unit)}${unitSuffix(q.unit)}`;
  return q.answer;
}

export function givenText(q: Question, given: string | number | null): string {
  if (given === null || given === '') return '—';
  if (q.type === 'estimate' && typeof given === 'number') {
    return `${formatEstimate(given, q.unit)}${unitSuffix(q.unit)} (${deviationLabel(q, given, q.answer)})`;
  }
  return String(given);
}

export function revealTitle(r: RevealedAnswer): string {
  if (r.timedOut || r.given === null) return '⏰ Bez odpovědi';
  if (r.awaitingJudge) return '❔ Čeká na verdikt';
  return r.correct ? '✅ Správně' : '🙈 Vedle';
}

/** "🦔 Ježek" → ["🦔", "Ježek"] for picture tiles. */
export function splitEmoji(option: string): [string, string] {
  const m = option.match(/^(\S+)\s+(.*)$/u);
  return m ? [m[1], m[2]] : ['', option];
}
