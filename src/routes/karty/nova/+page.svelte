<script lang="ts">
  import { page } from '$app/state';
  import Guard from '#lib/ui/app/Guard.svelte';
  import NewCardMatch from '#lib/ui/app/NewCardMatch.svelte';

  const game = $derived(page.url.searchParams.get('hra') === 'zoliky' ? 'zoliky' : 'prsi');
  const night = $derived(Number(page.url.searchParams.get('night')) || null);
</script>

<svelte:head><title>Zápis: {game === 'zoliky' ? 'Žolíky' : 'Prší'} · Herní večer</title></svelte:head>

<main class="page stack">
  <Guard>
    {#if night}<p class="muted">Partie se zapíše do <a href={`/vecery/${night}`}>dnešního večera</a>.</p>{/if}
    <p class="muted">Hrajete s opravdovými kartami a sem jen zapisujete výsledky. Hru s kartami na telefonech spustíš z <a href={`/tv?hra=${game}-hra${night ? `&night=${night}` : ''}`}>televize</a>, trénink s počítačem je v <a href="/trenink">Tréninku karet</a>.</p>
    {#key game}
      <NewCardMatch gameType={game} nightId={night} />
    {/key}
  </Guard>
</main>
