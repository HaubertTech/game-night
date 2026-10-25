<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { LEVEL_LABELS, type Level } from '../../types.ts';
  import { LEVEL_EMOJI } from '../labels.ts';
  import { createRoom, loadSetting, saveSetting } from './setup-api.ts';

  interface PlayerRow {
    id: number;
    name: string;
    avatar: string;
    level: Level;
  }
  let { players, nightId }: { players: PlayerRow[]; nightId: number | null } = $props();

  const KEY = 'domaci-liga:live:setup:aktivity';
  const TIMERS = [30, 45, 60, 90, 120];
  const GOALS = [
    { id: 'p20', label: 'Do 20 bodů', goal: { kind: 'points', points: 20 } },
    { id: 'p30', label: 'Do 30 bodů', goal: { kind: 'points', points: 30 } },
    { id: 'p50', label: 'Do 50 bodů', goal: { kind: 'points', points: 50 } },
    { id: 'r1', label: '1 kolo', goal: { kind: 'rounds', rounds: 1 } },
    { id: 'r3', label: '3 kola', goal: { kind: 'rounds', rounds: 3 } },
    { id: 'r5', label: '5 kol', goal: { kind: 'rounds', rounds: 5 } },
  ] as const;

  let teamCount = $state(2);
  /** player id → team index (0-based); missing = not playing. */
  let assign = $state<Record<number, number>>({});
  /** player id → when it was put into its team; the earlier, the sooner it explains. */
  let order = $state<Record<number, number>>({});
  let seq = 0;
  let timer = $state(60);
  let goalId = $state<string>('p30');
  let allPlay = $state(false);
  let busy = $state(false);
  let error = $state('');

  const teams = $derived(
    Array.from({ length: teamCount }, (_, i) => players.filter((p) => assign[p.id] === i).sort((a, b) => (order[a.id] ?? 0) - (order[b.id] ?? 0))),
  );
  const problems = $derived(teams.some((t) => t.length < 2) ? 'Každý tým potřebuje aspoň dva hráče.' : '');

  onMount(() => {
    const saved = loadSetting<{ teamCount?: number; assign?: Record<number, number>; order?: Record<number, number>; timer?: number; goalId?: string; allPlay?: boolean }>(KEY);
    if (!saved) return;
    if (saved.teamCount && saved.teamCount >= 2 && saved.teamCount <= 4) teamCount = saved.teamCount;
    if (saved.timer && TIMERS.includes(saved.timer)) timer = saved.timer;
    if (saved.goalId && GOALS.some((g) => g.id === saved.goalId)) goalId = saved.goalId;
    allPlay = saved.allPlay === true;
    const next: Record<number, number> = {};
    const nextOrder: Record<number, number> = {};
    for (const [id, t] of Object.entries(saved.assign ?? {})) {
      if (players.some((p) => p.id === Number(id)) && t < teamCount) {
        next[Number(id)] = t;
        nextOrder[Number(id)] = saved.order?.[Number(id)] ?? ++seq;
      }
    }
    seq = Math.max(seq, ...Object.values(nextOrder), 0);
    assign = next;
    order = nextOrder;
  });

  function setTeam(playerId: number, team: number | null) {
    const next = { ...assign };
    if (team === null) delete next[playerId];
    else {
      if (next[playerId] !== team) order = { ...order, [playerId]: ++seq };
      next[playerId] = team;
    }
    assign = next;
  }

  function setTeamCount(n: number) {
    teamCount = n;
    assign = Object.fromEntries(Object.entries(assign).filter(([, t]) => t < n)) as Record<number, number>;
  }

  async function start() {
    if (problems || busy) return;
    busy = true;
    error = '';
    try {
      const goal = GOALS.find((g) => g.id === goalId)!.goal;
      const result = await createRoom({
        game: 'aktivity',
        teams: teams.map((t) => ({ player_ids: t.map((p) => p.id) })),
        timer_seconds: timer,
        goal,
        all_play_chance: allPlay ? 0.2 : 0,
        ...(nightId !== null ? { night_id: nightId } : {}),
      });
      if ('unauthorized' in result) return goto('/');
      saveSetting(KEY, { teamCount, assign, order, timer, goalId, allPlay });
      await goto(`/tv/${result.code}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<section class="card stack">
  <h2>Týmy</h2>
  <div class="row" role="group" aria-label="Počet týmů">
    <span class="label">Počet týmů</span>
    {#each [2, 3, 4] as n (n)}
      <button class="chip" aria-pressed={teamCount === n} onclick={() => setTeamCount(n)}>{n}</button>
    {/each}
  </div>
  {#if players.length === 0}
    <p class="muted">V domácnosti zatím nejsou hráči. Přidej je na <a href="/hraci">stránce hráčů</a>.</p>
  {/if}
  <ul class="assign">
    {#each players as p (p.id)}
      <li>
        <span class="who"><span class="emoji">{p.avatar}</span> {p.name} <span class="badge {p.level}">{LEVEL_EMOJI[p.level]} {LEVEL_LABELS[p.level]}</span></span>
        <span class="row" role="group" aria-label={`Tým hráče ${p.name}`}>
          <button class="chip" aria-pressed={assign[p.id] === undefined} onclick={() => setTeam(p.id, null)}>Nehraje</button>
          {#each Array.from({ length: teamCount }, (_, i) => i) as i (i)}
            <button class="chip" aria-pressed={assign[p.id] === i} onclick={() => setTeam(p.id, i)}>Tým {i + 1}</button>
          {/each}
        </span>
      </li>
    {/each}
  </ul>
  <p class="muted">Vysvětluje se v pořadí, v jakém hráče do týmu přidáš. Předškolákovi slovo přečte dospělý z týmu.</p>
</section>

<section class="card stack">
  <h2>Nastavení</h2>
  <div class="row" role="group" aria-label="Čas na tah">
    <span class="label">Čas na tah</span>
    {#each TIMERS as t (t)}
      <button class="chip" aria-pressed={timer === t} onclick={() => (timer = t)}>{t} s</button>
    {/each}
  </div>
  <div class="row" role="group" aria-label="Konec hry">
    <span class="label">Konec hry</span>
    {#each GOALS as g (g.id)}
      <button class="chip" aria-pressed={goalId === g.id} onclick={() => (goalId = g.id)}>{g.label}</button>
    {/each}
  </div>
  <div class="row" role="group" aria-label="Všichni hádají">
    <span class="label">Všichni hádají</span>
    <button class="chip" aria-pressed={!allPlay} onclick={() => (allPlay = false)}>Ne</button>
    <button class="chip" aria-pressed={allPlay} onclick={() => (allPlay = true)}>Občas (každé 5. slovo)</button>
  </div>
</section>

{#if problems && Object.keys(assign).length > 0}<p class="muted">{problems}</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="row">
  <button class="btn primary big" disabled={!!problems || busy} onclick={start}>📺 Založit místnost</button>
</div>

<style>
  .label {
    font-weight: 700;
    min-width: 12em;
  }
  .assign {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .assign li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 20px;
  }
  .who {
    min-width: 16em;
    font-weight: 700;
  }
  .error {
    color: var(--bad);
    font-weight: 700;
  }
</style>
