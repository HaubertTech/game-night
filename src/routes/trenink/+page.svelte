<script lang="ts">
  import Owl from '#lib/ui/karty-hra/Owl.svelte';
  import Card from '#lib/ui/karty-hra/Card.svelte';
</script>

<svelte:head><title>Trénink karet — Domácí liga</title></svelte:head>

<main class="page stack">
  <h1>Trénink</h1>
  <Owl pose="mava" text="Ahoj! Tady se naučíš prší a žolíky. Nejdřív si projdi pravidla se mnou, pak si zahraj proti počítači. Až to budeš umět, vezmi skutečné karty a zahrajte si s rodinou!" />
  <div class="games">
    <a class="game card" href="/trenink/prsi" data-testid="trenink-prsi">
      <div class="fan">
        <Card id="srdce-7" width={64} /><Card id="listy-svrsek" width={64} /><Card id="kule-eso" width={64} />
      </div>
      <h2>Prší</h2>
      <p class="muted">Mariášové karty. Přiznej barvu, nebo hodnotu. Sedma, eso a svršek.</p>
    </a>
    <a class="game card" href="/trenink/zoliky" data-testid="trenink-zoliky">
      <div class="fan">
        <Card id="srdce-11-0" width={64} /><Card id="srdce-12-0" width={64} /><Card id="zolik-0" width={64} />
      </div>
      <h2>Žolíky</h2>
      <p class="muted">Francouzské karty. Postupky, trojice, žolík a 42 bodů na první vyložení.</p>
    </a>
  </div>
</main>

<style>
  .games {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 18px;
  }
  .game {
    color: inherit;
    text-decoration: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .game p {
    margin: 0;
  }
  .fan {
    display: flex;
    gap: 6px;
  }
</style>
