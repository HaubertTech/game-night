<script lang="ts">
  import LessonPlayer from '#lib/ui/karty-hra/LessonPlayer.svelte';
  import { loadSetup } from '#lib/ui/karty-hra/storage.ts';

  const audience = loadSetup('prsi').audience;
</script>

<svelte:head><title>Prší — lekce</title></svelte:head>

<main class="page stack">
  <a class="btn small ghost back" href="/trenink/prsi">← Prší</a>
  <LessonPlayer game="prsi" {audience} />
</main>

<style>
  .back {
    align-self: flex-start;
  }
</style>
