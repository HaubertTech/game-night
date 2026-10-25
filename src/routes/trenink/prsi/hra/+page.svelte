<script lang="ts">
  import Owl from '#lib/ui/art/Owl.svelte';
  import type { PrsiGameState } from '#lib/games/karty-hra/prsi-engine.ts';
  import PrsiTable from '#lib/ui/karty-hra/PrsiTable.svelte';
  import { loadGame } from '#lib/ui/karty-hra/storage.ts';

  const saved = loadGame<PrsiGameState>('prsi');
  const valid = saved?.state?.game === 'prsi-hra';
</script>

<svelte:head><title>Prší s počítačem · Herní večer</title></svelte:head>

{#if saved && valid}
  <PrsiTable {saved} />
{:else}
  <main class="page stack">
    <Owl pose="premysli" text="Rozehranou hru tu nemáš. Založ si novou.">
      <a class="btn primary" href="/trenink/prsi">Nová hra</a>
    </Owl>
  </main>
{/if}
