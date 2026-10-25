<script lang="ts">
  // TV setup of digital prší / žolíky: people on phones, computers for the free seats, hints for
  // children, the length of the game and an optional time limit per turn.
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { LEVEL_LABELS as PLAYER_LEVEL_LABELS, type Level } from '../../types.ts';
  import type { AiLevel } from '../../games/karty-hra/prsi-engine.ts';
  import { LEVEL_EMOJI } from '../labels.ts';
  import { LEVEL_LABELS } from '../karty-hra/storage.ts';
  import { createRoom, loadSetting, saveSetting } from './setup-api.ts';

  interface PlayerRow {
    id: number;
    name: string;
    avatar: string;
    level: Level;
  }
  let { players, nightId, game }: { players: PlayerRow[]; nightId: number | null; game: 'prsi-hra' | 'zoliky-hra' } = $props();

  const MAX_SEATS = 5;
  const TURN_LIMITS: (number | null)[] = [null, 30, 60, 90];
  const LENGTHS = $derived(game === 'prsi-hra' ? [1, 3, 5] : [1, 5, 10]);
  const key = $derived(`domaci-liga:live:setup:${game}`);

  let selected = $state<number[]>([]);
  let computers = $state(1);
  let level = $state<AiLevel>(2);
  let hints = $state<number[]>([]);
  let turnSeconds = $state<number | null>(null);
  // svelte-ignore state_referenced_locally
  let length = $state(game === 'prsi-hra' ? 1 : 10);
  let busy = $state(false);
  let error = $state('');

  onMount(() => {
    const saved = loadSetting<{ selected?: number[]; computers?: number; level?: AiLevel; hints?: number[]; turnSeconds?: number | null; length?: number }>(key);
    if (!saved) return;
    selected = (saved.selected ?? []).filter((id) => players.some((p) => p.id === id)).slice(0, MAX_SEATS);
    if (Number.isInteger(saved.computers)) computers = Math.max(0, Math.min(4, saved.computers!));
    if (saved.level === 1 || saved.level === 2 || saved.level === 3) level = saved.level;
    hints = (saved.hints ?? []).filter((id) => selected.includes(id));
    if (saved.turnSeconds === null || TURN_LIMITS.includes(saved.turnSeconds ?? null)) turnSeconds = saved.turnSeconds ?? null;
    if (saved.length && LENGTHS.includes(saved.length)) length = saved.length;
  });

  const maxComputers = $derived(Math.max(0, Math.min(4, MAX_SEATS - selected.length)));
  const seats = $derived(selected.length + Math.min(computers, maxComputers));
  const ready = $derived(selected.length >= 1 && seats >= 2 && seats <= MAX_SEATS && !busy);

  function toggle(p: PlayerRow) {
    if (selected.includes(p.id)) {
      selected = selected.filter((x) => x !== p.id);
      hints = hints.filter((x) => x !== p.id);
      return;
    }
    if (selected.length >= MAX_SEATS) return;
    selected = [...selected, p.id];
    // Children get hints by default.
    if (p.level !== 'hospoda' && !hints.includes(p.id)) hints = [...hints, p.id];
  }

  function toggleHints(id: number) {
    hints = hints.includes(id) ? hints.filter((x) => x !== id) : [...hints, id];
  }

  async function start() {
    if (!ready) return;
    busy = true;
    error = '';
    try {
      const result = await createRoom({
        game,
        player_ids: selected,
        computers: Math.min(computers, maxComputers),
        computer_level: level,
        hints_for: hints.filter((id) => selected.includes(id)),
        turn_seconds: turnSeconds,
        [game === 'prsi-hra' ? 'deals' : 'rounds']: length,
        ...(nightId !== null ? { night_id: nightId } : {}),
      });
      if ('unauthorized' in result) return goto('/');
      saveSetting(key, { selected, computers, level, hints, turnSeconds, length });
      await goto(`/tv/${result.code}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<section class="card stack">
  <h2>Kdo hraje na telefonu</h2>
  {#if players.length === 0}
    <p class="muted">V domácnosti zatím nejsou hráči. Přidej je na <a href="/hraci">stránce hráčů</a>.</p>
  {/if}
  <div class="row" role="group" aria-label="Hráči">
    {#each players as p (p.id)}
      <button class="chip" aria-pressed={selected.includes(p.id)} onclick={() => toggle(p)} aria-label={`${p.name} hraje`}>
        <span class="emoji">{p.avatar}</span> {p.name} <span class="badge {p.level}">{LEVEL_EMOJI[p.level]} {PLAYER_LEVEL_LABELS[p.level]}</span>
      </button>
    {/each}
  </div>
  {#if selected.length}
    <div class="row" role="group" aria-label="Nápovědy">
      <span class="label">Nápovědy na telefonu</span>
      {#each players.filter((p) => selected.includes(p.id)) as p (p.id)}
        <button class="chip" aria-pressed={hints.includes(p.id)} onclick={() => toggleHints(p.id)} aria-label={`Nápovědy: ${p.name}`}>💡 {p.name}</button>
      {/each}
    </div>
  {/if}
</section>

<section class="card stack">
  <h2>Počítač</h2>
  <div class="row" role="group" aria-label="Počet počítačů">
    <span class="label">Počet počítačů</span>
    {#each [0, 1, 2, 3, 4] as n (n)}
      <button class="chip" aria-pressed={Math.min(computers, maxComputers) === n} disabled={n > maxComputers} onclick={() => (computers = n)}>{n}</button>
    {/each}
  </div>
  <div class="row" role="group" aria-label="Síla počítače">
    <span class="label">Síla</span>
    {#each [1, 2, 3] as const as l (l)}
      <button class="chip" aria-pressed={level === l} onclick={() => (level = l)}>{LEVEL_LABELS[l]}</button>
    {/each}
  </div>
  <p class="muted">U stolu sedí 2 až 5 hráčů. Počítače táhnou samy, jejich karty nikdo nevidí.</p>
</section>

<section class="card stack">
  <h2>Nastavení</h2>
  <div class="row" role="group" aria-label={game === 'prsi-hra' ? 'Počet partií' : 'Počet kol'}>
    <span class="label">{game === 'prsi-hra' ? 'Počet partií' : 'Počet kol'}</span>
    {#each LENGTHS as n (n)}
      <button class="chip" aria-pressed={length === n} onclick={() => (length = n)}>{n}</button>
    {/each}
  </div>
  <div class="row" role="group" aria-label="Čas na tah">
    <span class="label">Čas na tah</span>
    {#each TURN_LIMITS as t (t ?? 'none')}
      <button class="chip" aria-pressed={turnSeconds === t} onclick={() => (turnSeconds = t)}>{t === null ? 'Bez limitu' : `${t} s`}</button>
    {/each}
  </div>
  <p class="muted">Po vypršení času za hráče {game === 'prsi-hra' ? 'lízne počítač' : 'dohraje tah počítač'}.</p>
</section>

{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="row">
  <button class="btn primary big" disabled={!ready} onclick={start}>📺 Založit místnost</button>
</div>

<style>
  .label {
    font-weight: 700;
    min-width: 12em;
  }
  .error {
    color: var(--bad);
    font-weight: 700;
  }
</style>
