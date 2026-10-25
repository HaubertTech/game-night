<script lang="ts">
  import Owl from '#lib/ui/art/Owl.svelte';
  import GameCard from '#lib/ui/art/GameCard.svelte';
  import { GAME_ART, GAME_NAMES } from '#lib/ui/art/art.ts';
</script>

<svelte:head><title>Trénink karet · Herní večer</title></svelte:head>

<main class="page stack">
  <h1>Trénink karet</h1>
  <Owl pose="mava" text="Ahoj! Tady se naučíš prší a žolíky. Nejdřív si se mnou projdi pravidla, pak si zahraj proti počítači. Až to budeš umět, vezmi skutečné karty a zahrajte si s rodinou." />
  <div class="games">
    <GameCard
      art={GAME_ART.prsi}
      title={GAME_NAMES.prsi}
      text="Mariášové karty. Přiznej barvu, nebo hodnotu. Sedma, eso a svršek."
      href="/trenink/prsi"
      testid="trenink-prsi"
    />
    <GameCard
      art={GAME_ART.zoliky}
      title={GAME_NAMES.zoliky}
      text="Francouzské karty. Postupky, trojice, žolík a 42 bodů na první vyložení."
      href="/trenink/zoliky"
      testid="trenink-zoliky"
    />
  </div>
</main>

<style>
  .games {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 18px;
  }
</style>
