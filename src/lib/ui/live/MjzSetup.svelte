<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { LEVEL_LABELS, type Level } from '../../types.ts';
  import { LEVEL_EMOJI } from '../labels.ts';
  import { ADULT_CATEGORIES, KIDS_CATEGORIES } from '../../games/mjz/engine.ts';
  import { createRoom, loadSetting, saveSetting } from './setup-api.ts';

  interface PlayerRow {
    id: number;
    name: string;
    avatar: string;
    level: Level;
  }
  let { players, nightId }: { players: PlayerRow[]; nightId: number | null } = $props();

  const KEY = 'domaci-liga:live:setup:mjz';
  const ROUNDS = [1, 3, 5, 8];
  const TIMES = [60, 90, 120, 180];

  let selected = $state<number[]>([]);
  let set = $state<'adult' | 'kids'>('adult');
  let rounds = $state(5);
  let time = $state(90);
  let includeCh = $state(false);
  let kidsBonus = $state(false);
  let busy = $state(false);
  let error = $state('');

  onMount(() => {
    const saved = loadSetting<{ selected?: number[]; set?: 'adult' | 'kids'; rounds?: number; time?: number; includeCh?: boolean; kidsBonus?: boolean }>(KEY);
    if (!saved) return;
    selected = (saved.selected ?? []).filter((id) => players.some((p) => p.id === id));
    if (saved.set === 'adult' || saved.set === 'kids') set = saved.set;
    if (saved.rounds && ROUNDS.includes(saved.rounds)) rounds = saved.rounds;
    if (saved.time && TIMES.includes(saved.time)) time = saved.time;
    includeCh = saved.includeCh === true;
    kidsBonus = saved.kidsBonus === true;
  });

  function toggle(id: number) {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  async function start() {
    if (selected.length === 0 || busy) return;
    busy = true;
    error = '';
    try {
      const result = await createRoom({
        game: 'mjz',
        player_ids: selected,
        category_set: set,
        rounds,
        time_seconds: time,
        include_ch: includeCh,
        kids_bonus: kidsBonus,
        ...(nightId !== null ? { night_id: nightId } : {}),
      });
      if ('unauthorized' in result) return goto('/');
      saveSetting(KEY, { selected, set, rounds, time, includeCh, kidsBonus });
      await goto(`/tv/${result.code}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<section class="card stack">
  <h2>Kdo hraje</h2>
  {#if players.length === 0}
    <p class="muted">V domácnosti zatím nejsou hráči. Přidej je na <a href="/hraci">stránce hráčů</a>.</p>
  {/if}
  <div class="row" role="group" aria-label="Hráči">
    {#each players as p (p.id)}
      <button class="chip" aria-pressed={selected.includes(p.id)} onclick={() => toggle(p.id)} aria-label={`${p.name} hraje`}>
        <span class="emoji">{p.avatar}</span> {p.name} <span class="badge {p.level}">{LEVEL_EMOJI[p.level]} {LEVEL_LABELS[p.level]}</span>
      </button>
    {/each}
  </div>
  <p class="muted">Lavice má na psaní o 30 s víc, pískoviště o 60 s; za předškoláka může psát hostitel na televizi.</p>
</section>

<section class="card stack">
  <h2>Nastavení</h2>
  <div class="row" role="group" aria-label="Kategorie">
    <span class="label">Kategorie</span>
    <button class="chip" aria-pressed={set === 'adult'} onclick={() => (set = 'adult')}>Dospělí: {ADULT_CATEGORIES.map((c) => c.label).join(', ')}</button>
    <button class="chip" aria-pressed={set === 'kids'} onclick={() => (set = 'kids')}>Děti: {KIDS_CATEGORIES.map((c) => c.label).join(', ')}</button>
  </div>
  <div class="row" role="group" aria-label="Počet kol">
    <span class="label">Počet kol</span>
    {#each ROUNDS as n (n)}
      <button class="chip" aria-pressed={rounds === n} onclick={() => (rounds = n)}>{n}</button>
    {/each}
  </div>
  <div class="row" role="group" aria-label="Čas na psaní">
    <span class="label">Čas na psaní</span>
    {#each TIMES as t (t)}
      <button class="chip" aria-pressed={time === t} onclick={() => (time = t)}>{t} s</button>
    {/each}
  </div>
  <div class="row" role="group" aria-label="Pravidla">
    <span class="label">Pravidla</span>
    <button class="chip" aria-pressed={includeCh} onclick={() => (includeCh = !includeCh)}>Hrát i na Ch</button>
    <button class="chip" aria-pressed={kidsBonus} onclick={() => (kidsBonus = !kidsBonus)}>Dětský bonus (lavice ×1,5)</button>
  </div>
</section>

{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="row">
  <button class="btn primary big" disabled={selected.length === 0 || busy} onclick={start}>📺 Založit místnost</button>
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
