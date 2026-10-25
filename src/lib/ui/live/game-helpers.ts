// Helpers that turn aktivity / mjz views into what the screens show (kept out of .svelte for tests).

import type { Standing } from '../../engine/quiz.ts';
import type { AktivityPlayer, AktivityTeam, TurnRecord } from '../../games/aktivity/engine.ts';
import type { AktivityMode } from '../../games/aktivity/types.ts';
import type { MjzAnswerView, MjzView } from '../../games/mjz/view.ts';
import type { AktivityRoomView } from '../../live/protocol.ts';

export const MODE_EMOJI: Record<AktivityMode, string> = {
  rekni: '🗣️',
  ukaz: '🙌',
  nakresli: '✏️',
};

export type PlayerWithTeam = AktivityPlayer & { teamId: string };

export function aktivityPlayers(view: Pick<AktivityRoomView, 'teams'>): Map<string, PlayerWithTeam> {
  const out = new Map<string, PlayerWithTeam>();
  for (const t of view.teams) for (const p of t.players) out.set(p.id, { ...p, teamId: t.id });
  return out;
}

export function aktivityStandingRows(view: Pick<AktivityRoomView, 'teams' | 'standings'>): Standing[] {
  const teams = new Map(view.teams.map((t) => [t.id, t]));
  return view.standings.map((s) => {
    const t = teams.get(s.teamId);
    return {
      contestant: { id: s.teamId, name: t?.name ?? s.teamId, avatar: t?.avatar ?? '👥', level: 'hospoda', memberIds: [] },
      score: s.score,
      roundPoints: 0,
      place: s.place,
    };
  });
}

export function aktivityOutcomeText(turn: Pick<TurnRecord, 'outcome' | 'points' | 'scoringTeamId'>, teams: Map<string, Pick<AktivityTeam, 'name'>>): string {
  if (turn.outcome === 'guessed') {
    const name = turn.scoringTeamId ? teams.get(turn.scoringTeamId)?.name : null;
    return `✅ Uhodli! +${turn.points} ${turn.points === 5 ? 'bodů' : 'body'}${name ? ` pro ${name}` : ''}`;
  }
  return turn.outcome === 'skipped' ? '⏭ Přeskočeno, bez bodů' : '⏰ Čas vypršel, bez bodů';
}

export function mjzStandingRows(view: Pick<MjzView, 'contestants' | 'standings' | 'lastResult'>): Standing[] {
  const byId = new Map(view.contestants.map((c) => [c.id, c]));
  return view.standings
    .filter((s) => byId.has(s.contestantId) && !byId.get(s.contestantId)!.kicked)
    .map((s) => {
      const c = byId.get(s.contestantId)!;
      return {
        contestant: { id: c.id, name: c.name, avatar: c.avatar, level: c.level, memberIds: [] },
        score: s.score,
        roundPoints: view.lastResult?.points[c.id] ?? 0,
        place: s.place,
      };
    });
}

/** Written, with the right letter: may be challenged, voted on and ruled. */
export function mjzReviewable(a: Pick<MjzAnswerView, 'verdict'>): boolean {
  return a.verdict === 'valid' || a.verdict === 'invalid';
}

export function mjzVerdictLabel(a: Pick<MjzAnswerView, 'verdict' | 'decidedBy'>): string {
  switch (a.verdict) {
    case 'empty':
      return '— nevyplněno';
    case 'wrongLetter':
      return '🔤 jiné písmeno';
    case 'invalid':
      return a.decidedBy === 'host' ? '❌ neplatí (hostitel)' : '❌ neplatí (hlasování)';
    default:
      return a.decidedBy === 'host' ? '✅ platí (hostitel)' : a.decidedBy === 'vote' ? '✅ platí (hlasování)' : '✅ platí';
  }
}

export function mjzKnownLabel(known: boolean | null): string {
  if (known === null) return '';
  return known ? '📗 známá' : '❔ neověřená';
}
