<script lang="ts">
  import { onMount } from 'svelte';
  import Owl from '#lib/ui/art/Owl.svelte';
  import { loadGame } from '#lib/ui/chess/storage.ts';
  import type { ChessState } from '#lib/games/chess/engine.ts';

  let aiGame = $state<ChessState | null>(null);
  let localGame = $state<ChessState | null>(null);

  onMount(() => {
    const a = loadGame('ai');
    const l = loadGame('local');
    aiGame = a && !a.result && a.moves.length ? a : null;
    localGame = l && !l.result && l.moves.length ? l : null;
  });

  const tiles = [
    { href: '/sachy/pocitac', emoji: '🤖', title: 'Hrát s počítačem', text: 'Šest sil soupeře — od Kuřátka pro nejmenší po Sovu.' },
    { href: '/sachy/dva', emoji: '👫', title: 'Dva hráči u tabletu', text: 'Partie u jednoho stolu, s hodinami i bez.' },
    { href: '/sachy/uceni', emoji: '🎓', title: 'Učení', text: 'Figurky, šach, mat a rošáda krok za krokem.' },
    { href: '/sachy/ulohy', emoji: '🧩', title: 'Úlohy', text: 'Mat jedním tahem, vidličky a výhra figury.' },
  ];
</script>

<svelte:head><title>Šachy · Domácí liga</title></svelte:head>

<main class="page stack">
  <h1>♞ Šachy</h1>
  <Owl mood="mava" text="Ahoj! Zahraj si s počítačem, s někým z rodiny, nebo se se mnou nauč, jak figurky chodí." />

  {#if aiGame || localGame}
    <div class="card stack resume">
      <h2>Rozehraná partie</h2>
      <div class="row">
        {#if aiGame}
          <a class="btn primary" href="/sachy/hra?m=ai">▶ Pokračovat s počítačem ({aiGame.moves.length} tahů)</a>
        {/if}
        {#if localGame}
          <a class="btn primary" href="/sachy/hra?m=local">▶ Pokračovat: {localGame.players.w.name} × {localGame.players.b.name}</a>
        {/if}
      </div>
    </div>
  {/if}

  <div class="tiles">
    {#each tiles as t (t.href)}
      <a class="card tile" href={t.href}>
        <span class="emoji" aria-hidden="true">{t.emoji}</span>
        <strong>{t.title}</strong>
        <span class="muted">{t.text}</span>
      </a>
    {/each}
  </div>
  <p class="muted">Každý na svém mobilu (živá místnost) připravujeme.</p>
</main>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-decoration: none;
    color: inherit;
    min-height: 170px;
  }
  .tile .emoji {
    font-size: 2.6rem;
  }
  .tile strong {
    font-size: 1.35rem;
  }
</style>
