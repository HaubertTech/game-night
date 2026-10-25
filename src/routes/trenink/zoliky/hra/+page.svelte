<script lang="ts">
  import type { ZolikyGameState } from '#lib/games/karty-hra/zoliky-engine.ts';
  import ZolikyTable from '#lib/ui/karty-hra/ZolikyTable.svelte';
  import { loadGame } from '#lib/ui/karty-hra/storage.ts';

  const saved = loadGame<ZolikyGameState>('zoliky');
  const valid = saved?.state?.game === 'zoliky-hra';
</script>

<svelte:head><title>Žolíky — hra s počítačem</title></svelte:head>

{#if saved && valid}
  <ZolikyTable {saved} />
{:else}
  <main class="page stack">
    <p>Žádná rozehraná hra.</p>
    <a class="btn primary" href="/trenink/zoliky">Nová hra</a>
  </main>
{/if}
