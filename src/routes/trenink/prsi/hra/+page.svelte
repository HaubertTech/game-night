<script lang="ts">
  import type { PrsiGameState } from '#lib/games/karty-hra/prsi-engine.ts';
  import PrsiTable from '#lib/ui/karty-hra/PrsiTable.svelte';
  import { loadGame } from '#lib/ui/karty-hra/storage.ts';

  const saved = loadGame<PrsiGameState>('prsi');
  const valid = saved?.state?.game === 'prsi-hra';
</script>

<svelte:head><title>Prší — hra s počítačem</title></svelte:head>

{#if saved && valid}
  <PrsiTable {saved} />
{:else}
  <main class="page stack">
    <p>Žádná rozehraná hra.</p>
    <a class="btn primary" href="/trenink/prsi">Nová hra</a>
  </main>
{/if}
