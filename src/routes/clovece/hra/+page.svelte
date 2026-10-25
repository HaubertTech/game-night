<script lang="ts">
  import { onMount } from 'svelte';
  import TabletGame from '#lib/ui/clovece/TabletGame.svelte';
  import { loadGame, type SavedGame } from '#lib/ui/clovece/storage.ts';

  let saved = $state<SavedGame | null>(null);
  let loaded = $state(false);
  onMount(() => {
    saved = loadGame();
    loaded = true;
  });
</script>

<svelte:head><title>Člověče, nezlob se — hra · Herní večer</title></svelte:head>

<main class="page stack">
  <div class="row">
    <a href="/clovece" class="btn small ghost">← Člověče</a>
  </div>
  {#if saved}
    <TabletGame {saved} />
  {:else if loaded}
    <section class="card stack">
      <h2>Žádná rozehraná hra</h2>
      <a class="btn primary" href="/clovece">Založit hru</a>
    </section>
  {/if}
</main>
