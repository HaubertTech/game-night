<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import GameScreen from '#lib/ui/chess/GameScreen.svelte';
  import { loadAiSetup, loadGame, type SavedMode } from '#lib/ui/chess/storage.ts';
  import type { ChessState } from '#lib/games/chess/engine.ts';

  const mode: SavedMode = page.url.searchParams.get('m') === 'local' ? 'local' : 'ai';
  let game = $state<ChessState | null>(null);
  let hints = $state(true);

  onMount(() => {
    game = loadGame(mode);
    hints = mode === 'ai' ? loadAiSetup().hints : true;
    if (!game) goto(mode === 'ai' ? '/sachy/pocitac' : '/sachy/dva', { replaceState: true });
  });
</script>

<svelte:head><title>Partie · Šachy</title></svelte:head>

<main class="page">
  {#if game}
    <GameScreen initial={game} {mode} hintsEnabled={hints} onexit={() => goto('/sachy')} />
  {/if}
</main>
