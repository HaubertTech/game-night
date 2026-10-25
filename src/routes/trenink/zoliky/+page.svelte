<script lang="ts">
  import GameSetup from '#lib/ui/karty-hra/GameSetup.svelte';
  import Owl from '#lib/ui/karty-hra/Owl.svelte';
</script>

<svelte:head><title>Žolíky — trénink</title></svelte:head>

<main class="page stack">
  <a class="btn small ghost back" href="/trenink">← Trénink</a>
  <h1>Žolíky</h1>
  <Owl pose="otazka" text="Skládej postupky a trojice, vykládej a zavři kolo. Projdi si pravidla krok po kroku, nebo si rovnou zahraj." />
  <div class="cols">
    <div class="card stack">
      <h2>Naučit se pravidla</h2>
      <p class="muted">Sova tě provede krok za krokem a u každého pravidla si to hned vyzkoušíš.</p>
      <a class="btn primary big" href="/trenink/zoliky/lekce">Začít lekci</a>
    </div>
    <GameSetup game="zoliky" />
  </div>
</main>

<style>
  .back {
    align-self: flex-start;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 18px;
    align-items: start;
  }
  .cols p {
    margin: 0;
  }
</style>
