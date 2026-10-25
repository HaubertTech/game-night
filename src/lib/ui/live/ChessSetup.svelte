<script lang="ts">
  import Avatar from '#lib/ui/art/Avatar.svelte';
  // TV setup of a chess room: who plays white, who black, and the clock.
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Level } from '../../types.ts';
  import { createRoom, loadSetting, saveSetting } from './setup-api.ts';

  interface PlayerRow {
    id: number;
    name: string;
    avatar: string;
    level: Level;
  }
  let { players, nightId }: { players: PlayerRow[]; nightId: number | null } = $props();

  const KEY = 'domaci-liga:live:setup:chess';
  const CLOCKS = [
    { id: 'none', label: 'Bez hodin', minutes: 0, inc: 0 },
    { id: '5', label: '5 minut', minutes: 5, inc: 0 },
    { id: '10', label: '10 minut', minutes: 10, inc: 0 },
    { id: '15+5', label: '15 min + 5 s', minutes: 15, inc: 5 },
    { id: '30', label: '30 minut', minutes: 30, inc: 0 },
  ];

  let white = $state<number | null>(null);
  let black = $state<number | null>(null);
  let clock = $state('10');
  let busy = $state(false);
  let error = $state('');

  onMount(() => {
    const saved = loadSetting<{ white?: number; black?: number; clock?: string }>(KEY);
    if (saved?.white && players.some((p) => p.id === saved.white)) white = saved.white;
    if (saved?.black && players.some((p) => p.id === saved.black)) black = saved.black;
    if (saved?.clock && CLOCKS.some((c) => c.id === saved.clock)) clock = saved.clock;
  });

  const ready = $derived(white !== null && black !== null && white !== black && !busy);

  function pick(color: 'w' | 'b', id: number) {
    if (color === 'w') {
      white = id;
      if (black === id) black = null;
    } else {
      black = id;
      if (white === id) white = null;
    }
  }

  function swap() {
    [white, black] = [black, white];
  }

  async function start() {
    if (!ready) return;
    busy = true;
    error = '';
    try {
      const c = CLOCKS.find((x) => x.id === clock) ?? CLOCKS[0];
      const result = await createRoom({
        game: 'chess',
        white_id: white,
        black_id: black,
        minutes: c.minutes,
        increment_seconds: c.inc,
        ...(nightId !== null ? { night_id: nightId } : {}),
      });
      if ('unauthorized' in result) return goto('/');
      saveSetting(KEY, { white, black, clock });
      await goto(`/tv/${result.code}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

{#if players.length < 2}
  <section class="card"><p class="muted">Na šachy jsou potřeba dva hráči. Přidej je na <a href="/hraci">stránce hráčů</a>.</p></section>
{/if}
{#each [{ color: 'w' as const, title: '⚪ Bílé (začínají)', value: white }, { color: 'b' as const, title: '⚫ Černé', value: black }] as side (side.color)}
  <section class="card stack">
    <h2>{side.title}</h2>
    <div class="row" role="group" aria-label={side.color === 'w' ? 'Bílé' : 'Černé'}>
      {#each players as p (p.id)}
        <button class="chip" aria-pressed={side.value === p.id} onclick={() => pick(side.color, p.id)}>
          <span class="emoji"><Avatar value={p.avatar} /></span> {p.name}
        </button>
      {/each}
    </div>
  </section>
{/each}
<div class="row"><button class="btn small" onclick={swap} disabled={white === null && black === null}>⇅ Prohodit barvy</button></div>

<section class="card stack">
  <h2>Hodiny</h2>
  <div class="row" role="group" aria-label="Hodiny">
    {#each CLOCKS as c (c.id)}
      <button class="chip" aria-pressed={clock === c.id} onclick={() => (clock = c.id)}>{c.label}</button>
    {/each}
  </div>
  <p class="muted">Každý hraje na svém telefonu, televize ukazuje šachovnici, hodiny a zápis tahů. Partie se zapisuje do ligy.</p>
</section>

{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="row">
  <button class="btn primary big" disabled={!ready} onclick={start}>📺 Založit místnost</button>
</div>

<style>
  .error {
    color: var(--bad);
    font-weight: 700;
  }
</style>
