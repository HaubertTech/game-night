<script lang="ts">
  // "Hrát s počítačem": number and strength of opponents, hints, age, length of the game.
  import { goto } from '$app/navigation';
  import { createPrsiGame, type AiLevel, type TablePlayer } from '#lib/games/karty-hra/prsi-engine.ts';
  import { createZolikyGame } from '#lib/games/karty-hra/zoliky-engine.ts';
  import { LEVEL_LABELS, OPPONENT_NAMES, loadGame, loadSetup, saveGame, saveSetup, type TrainingGame, type TrainingSetup } from './storage.ts';

  let { game }: { game: TrainingGame } = $props();

  // svelte-ignore state_referenced_locally
  let setup: TrainingSetup = $state(loadSetup(game));
  const saved = $derived(loadGame<{ phase: string }>(game));
  const lengths = $derived(game === 'prsi' ? [1, 3, 5] : [3, 5, 10]);
  const maxOpponents = 4;

  function players(): TablePlayer[] {
    const me: TablePlayer = { id: 'ja', name: setup.name.trim() || 'Já' };
    const ai = Array.from({ length: setup.opponents }, (_, i) => ({ id: `pc${i + 1}`, name: OPPONENT_NAMES[i], ai: setup.level as AiLevel }));
    return [me, ...ai];
  }

  async function start() {
    saveSetup(game, setup);
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const base = { id: `trenink-${game}-${seed}`, createdAt: new Date().toISOString(), seed, players: players(), now: Date.now() };
    const state =
      game === 'prsi'
        ? createPrsiGame({ ...base, settings: { deals: setup.length } })
        : createZolikyGame({ ...base, settings: { rounds: setup.length } });
    saveGame(game, { setup: { ...setup }, state });
    await goto(`/trenink/${game}/hra`);
  }
</script>

<div class="setup card stack" data-testid="setup">
  <h2>Hrát s počítačem</h2>
  {#if saved && saved.state.phase !== 'finished'}
    <div class="row">
      <a class="btn clay" href="/trenink/{game}/hra">Pokračovat v rozehrané hře</a>
    </div>
  {/if}

  <label class="field">
    <span>Jméno</span>
    <input type="text" bind:value={setup.name} maxlength="20" autocomplete="off" />
  </label>

  <div class="field" role="group" aria-label="Počet soupeřů">
    <span>Počet soupeřů</span>
    <div class="row">
      {#each Array.from({ length: maxOpponents }, (_, i) => i + 1) as n (n)}
        <button type="button" class="chip" aria-pressed={setup.opponents === n} onclick={() => (setup.opponents = n)}>{n}</button>
      {/each}
    </div>
  </div>

  <div class="field" role="group" aria-label="Síla počítače">
    <span>Síla počítače</span>
    <div class="row">
      {#each [1, 2, 3] as const as level (level)}
        <button type="button" class="chip" aria-pressed={setup.level === level} onclick={() => (setup.level = level)}>{LEVEL_LABELS[level]}</button>
      {/each}
    </div>
  </div>

  <div class="field" role="group" aria-label="Kdo hraje">
    <span>Kdo hraje</span>
    <div class="row">
      <button type="button" class="chip" aria-pressed={setup.audience === 'kid'} onclick={() => (setup.audience = 'kid')}>Dítě</button>
      <button type="button" class="chip" aria-pressed={setup.audience === 'adult'} onclick={() => (setup.audience = 'adult')}>Dospělý</button>
    </div>
  </div>

  <div class="field" role="group" aria-label="Nápovědy">
    <span>Nápovědy</span>
    <div class="row">
      <button type="button" class="chip" aria-pressed={setup.hints} onclick={() => (setup.hints = true)}>Zapnuté</button>
      <button type="button" class="chip" aria-pressed={!setup.hints} onclick={() => (setup.hints = false)}>Vypnuté</button>
    </div>
  </div>

  <div class="field" role="group" aria-label={game === 'prsi' ? 'Počet partií' : 'Počet kol'}>
    <span>{game === 'prsi' ? 'Počet partií' : 'Počet kol'}</span>
    <div class="row">
      {#each lengths as n (n)}
        <button type="button" class="chip" aria-pressed={setup.length === n} onclick={() => (setup.length = n)}>{n}</button>
      {/each}
    </div>
  </div>

  <button type="button" class="btn primary big" onclick={start}>Začít hru</button>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field > span {
    font-weight: 700;
  }
</style>
