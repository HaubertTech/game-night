<script lang="ts">
  import { movePairs, type ChessState } from '../../games/chess/engine.ts';

  let { game }: { game: Pick<ChessState, 'startFen' | 'moves'> } = $props();
  const pairs = $derived(movePairs(game));
  let list: HTMLOListElement | undefined = $state();

  $effect(() => {
    void pairs.length;
    list?.scrollTo({ top: list.scrollHeight });
  });
</script>

<ol class="moves" bind:this={list} aria-label="Záznam tahů" data-testid="move-list">
  {#each pairs as p (p.n)}
    <li><span class="n">{p.n}.</span><span>{p.w ?? '…'}</span><span>{p.b ?? ''}</span></li>
  {:else}
    <li class="muted empty">Zatím žádný tah</li>
  {/each}
</ol>

<style>
  .moves {
    list-style: none;
    margin: 0;
    padding: 8px 10px;
    max-height: 220px;
    overflow-y: auto;
    background: var(--paper);
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    font-variant-numeric: tabular-nums;
  }
  li {
    display: grid;
    grid-template-columns: 2.6em 1fr 1fr;
    gap: 4px;
    padding: 2px 0;
  }
  .n {
    color: var(--ink-soft);
  }
  .empty {
    display: block;
  }
</style>
