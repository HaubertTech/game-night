<script lang="ts">
  import Owl from '#lib/ui/art/Owl.svelte';
  import type { ZolikyGameState } from '#lib/games/karty-hra/zoliky-engine.ts';
  import ZolikyTable from '#lib/ui/karty-hra/ZolikyTable.svelte';
  import { loadGame } from '#lib/ui/karty-hra/storage.ts';

  const saved = loadGame<ZolikyGameState>('zoliky');
  const valid = saved?.state?.game === 'zoliky-hra';
</script>

<svelte:head><title>Žolíky s počítačem · Herní večer</title></svelte:head>

{#if saved && valid}
  <ZolikyTable {saved} />
{:else}
  <main class="page stack">
    <Owl pose="premysli" text="Rozehranou hru tu nemáš. Založ si novou.">
      <a class="btn primary" href="/trenink/zoliky">Nová hra</a>
    </Owl>
  </main>
{/if}
