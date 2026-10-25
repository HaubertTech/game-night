<script lang="ts">
  import LessonPlayer from '#lib/ui/karty-hra/LessonPlayer.svelte';
  import { loadSetup } from '#lib/ui/karty-hra/storage.ts';

  const audience = loadSetup('zoliky').audience;
</script>

<svelte:head><title>Lekce žolíků · Herní večer</title></svelte:head>

<main class="page stack">
  <a class="btn small ghost back" href="/trenink/zoliky">← Žolíky</a>
  <LessonPlayer game="zoliky" {audience} />
</main>

<style>
  .back {
    align-self: flex-start;
  }
</style>
