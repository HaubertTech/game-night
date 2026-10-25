<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { DEFAULT_ZOLIKY_SETTINGS } from '#lib/cards/zoliky.ts';
  import { api, ApiError, GAME_EMOJI, GAME_LABELS } from './api.ts';

  interface Player {
    id: number;
    name: string;
    avatar: string;
  }

  let { gameType, nightId = null, oncancel }: { gameType: 'prsi' | 'zoliky'; nightId?: number | null; oncancel?: () => void } = $props();

  let players = $state<Player[]>([]);
  let selected = $state<number[]>([]);
  let limit = $state<number | null>(DEFAULT_ZOLIKY_SETTINGS.limit);
  let maxRounds = $state<number | null>(10);
  let limitMode = $state<'endGame' | 'eliminate'>(DEFAULT_ZOLIKY_SETTINGS.limitMode);
  let fromHandDouble = $state(DEFAULT_ZOLIKY_SETTINGS.closeFromHand.othersMultiplier === 2);
  let busy = $state(false);
  let message = $state<string | null>(null);

  onMount(() => {
    api<{ players: Player[] }>('/api/players')
      .then((r) => {
        players = r.players;
        selected = r.players.map((p) => p.id);
      })
      .catch(() => (message = 'Hráče se nepodařilo načíst.'));
  });

  function toggle(id: number) {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  async function create() {
    busy = true;
    message = null;
    try {
      const settings = gameType === 'zoliky' ? { limit, limitMode, maxRounds, closeFromHand: { othersMultiplier: fromHandDouble ? 2 : 1 } } : undefined;
      const { match } = await api<{ match: { id: number } }>('/api/matches', {
        body: { game_type: gameType, player_ids: players.filter((p) => selected.includes(p.id)).map((p) => p.id), night_id: nightId, settings },
      });
      goto(`/karty/${gameType}/${match.id}`);
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Partii se nepodařilo založit.';
      busy = false;
    }
  }
</script>

<section class="card stack" data-testid={`new-${gameType}`}>
  <h2 class="section-title">{GAME_EMOJI[gameType]} Nová partie: {GAME_LABELS[gameType]}</h2>
  <div class="field">
    <span>Kdo hraje</span>
    <div class="row" role="group" aria-label="Kdo hraje">
      {#each players as p (p.id)}
        <button type="button" class="chip" aria-pressed={selected.includes(p.id)} onclick={() => toggle(p.id)}>
          <span class="emoji">{p.avatar}</span>{p.name}
        </button>
      {/each}
    </div>
    {#if players.length === 0}<span class="muted">Nejdřív přidej hráče na stránce <a href="/hraci">Hráči</a>.</span>{/if}
  </div>
  {#if gameType === 'zoliky'}
    <div class="field">
      <span>Počet kol</span>
      <div class="row" role="group" aria-label="Počet kol">
        {#each [5, 10, 15, null] as r (r)}
          <button type="button" class="chip" aria-pressed={maxRounds === r} onclick={() => (maxRounds = r)}>{r === null ? 'Dokud chceme' : `${r} kol`}</button>
        {/each}
      </div>
    </div>
    <div class="field">
      <span>Limit bodů</span>
      <div class="row" role="group" aria-label="Limit bodů">
        {#each [null, 200, 500, 1000] as l (l)}
          <button type="button" class="chip" aria-pressed={limit === l} onclick={() => (limit = l)}>{l === null ? 'Bez limitu' : l}</button>
        {/each}
      </div>
    </div>
    {#if limit !== null}
      <div class="field">
        <span>Kdo přetáhne limit</span>
        <div class="row" role="group" aria-label="Kdo přetáhne limit">
          <button type="button" class="chip" aria-pressed={limitMode === 'endGame'} onclick={() => (limitMode = 'endGame')}>Hra končí pro všechny</button>
          <button type="button" class="chip" aria-pressed={limitMode === 'eliminate'} onclick={() => (limitMode = 'eliminate')}>Vypadává, ostatní hrají dál</button>
        </div>
      </div>
    {/if}
    <div class="field">
      <span>Zavření z ruky</span>
      <div class="row" role="group" aria-label="Zavření z ruky">
        <button type="button" class="chip" aria-pressed={fromHandDouble} onclick={() => (fromHandDouble = true)}>Ostatním ×2</button>
        <button type="button" class="chip" aria-pressed={!fromHandDouble} onclick={() => (fromHandDouble = false)}>Bez násobení</button>
      </div>
    </div>
    <p class="muted">Kdo zavře, má 0. Ostatní si píšou body z ruky, vyhrává nejméně bodů.</p>
  {:else}
    <p class="muted">Po každé partii ťukáš na hráče v pořadí, jak se zbavili karet. Vyhrává nejmenší součet pořadí.</p>
  {/if}
  {#if message}<p class="note warn" role="alert">{message}</p>{/if}
  <div class="row">
    <button class="btn primary big" disabled={busy || selected.length < 2} onclick={create}>▶️ Začít zápis</button>
    {#if oncancel}<button class="btn ghost" onclick={oncancel}>Zrušit</button>{/if}
  </div>
</section>
