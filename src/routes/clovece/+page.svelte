<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Owl from '#lib/ui/art/Owl.svelte';
  import GameCard from '#lib/ui/art/GameCard.svelte';
  import { GAME_ART } from '#lib/ui/art/art.ts';
  import TabletSetup from '#lib/ui/clovece/TabletSetup.svelte';
  import { loadGame, type SavedGame } from '#lib/ui/clovece/storage.ts';

  // ?seed=N replays the same dice (tests); ?night=<id> puts the game into an evening.
  const seedParam = page.url.searchParams.get('seed');
  const seed = seedParam && /^\d{1,10}$/.test(seedParam) ? Number(seedParam) : null;
  const nightParam = page.url.searchParams.get('night');
  const nightId = nightParam && /^\d{1,15}$/.test(nightParam) ? Number(nightParam) : null;

  let running = $state<SavedGame | null>(null);
  onMount(() => {
    const g = loadGame();
    running = g && g.state.phase === 'playing' ? g : null;
  });
</script>

<svelte:head><title>Člověče, nezlob se · Herní večer</title></svelte:head>

<main class="page stack">
  <h1>Člověče, nezlob se</h1>
  <Owl pose="mava" text="Ahoj! Hoď šestkou, nasaď figurku a dovez všechny čtyři domů. Kdo hraje poprvé, ať si se mnou projde lekci." />

  {#if running}
    <div class="card stack">
      <h2>Rozehraná hra</h2>
      <div class="row">
        <a class="btn primary" href="/clovece/hra" data-testid="clovece-resume">▶ Pokračovat: {running.state.players.map((p) => p.name).join(', ')}</a>
      </div>
    </div>
  {/if}

  <div class="tiles">
    <GameCard art="cards.trenink" title="Lekce se sovou" text="Kostka, nasazení, pohyb, vyhození a domeček krok za krokem." href="/clovece/lekce" testid="clovece-lekce" small />
    <GameCard art={GAME_ART.clovece} title="Na televizi a mobilech" text="Plán na televizi, každý hází ze svého mobilu. Potřebuje přihlášení." href={`/tv?hra=clovece${nightId ? `&night=${nightId}` : ''}`} testid="clovece-tv" small />
  </div>

  <h2 class="section-title">Hra na tabletu</h2>
  <TabletSetup {seed} {nightId} />
</main>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
  }
</style>
