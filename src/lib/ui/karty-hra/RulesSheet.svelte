<script lang="ts">
  // Short rules overview, available any time during a game or a lesson.
  import { LESSONS } from '#lib/games/karty-hra/learn/lessons.ts';

  let { game, open = $bindable(false) }: { game: 'prsi' | 'zoliky'; open?: boolean } = $props();
  const lesson = $derived(LESSONS[game]);
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={() => (open = false)}></div>
  <div class="sheet card" role="dialog" aria-modal="true" aria-label="Pravidla">
    <h2>Pravidla — {game === 'prsi' ? 'prší' : 'žolíky'}</h2>
    <ul>
      {#each lesson.rules as rule, i (i)}
        <li>{rule}</li>
      {/each}
    </ul>
    <div class="row">
      <a class="btn small ghost" href="/trenink/{game}/lekce">Projít lekci</a>
      <button type="button" class="btn small primary" onclick={() => (open = false)}>Zavřít</button>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(59, 51, 43, 0.35);
    z-index: 40;
  }
  .sheet {
    position: fixed;
    z-index: 41;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(640px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow: auto;
  }
  ul {
    margin: 0 0 16px;
    padding-left: 1.2em;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
