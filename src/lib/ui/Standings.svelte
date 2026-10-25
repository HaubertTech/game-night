<script lang="ts">
  import Art from '#lib/ui/art/Art.svelte';
  import { medalArt } from '#lib/ui/art/art.ts';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import type { Standing } from '../engine/quiz.ts';
  import { pointsLabel } from './labels.ts';

  let { rows, showRound = true }: { rows: Standing[]; showRound?: boolean } = $props();
</script>

<ol class="standings" data-testid="standings">
  {#each rows as row (row.contestant.id)}
    <li class:first={row.place === 1}>
      <span class="place">
        {#if medalArt(row.place)}
          <Art name={medalArt(row.place) ?? ''} alt={`${row.place}. místo`} size={44} class="medal" />
        {:else}{row.place}.{/if}
      </span>
      <span class="emoji avatar"><Avatar value={row.contestant.avatar} /></span>
      <span class="name">{row.contestant.name}</span>
      {#if showRound}<span class="round muted">+{row.roundPoints}</span>{/if}
      <span class="score">{pointsLabel(row.score)}</span>
    </li>
  {/each}
</ol>

<style>
  .standings {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    background: var(--paper);
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: 1.25rem;
  }
  li.first {
    border-color: var(--clay);
    background: var(--clay-light);
  }
  .place {
    display: flex;
    justify-content: center;
    flex: none;
    width: 2.2em;
    font-size: 1.6rem;
    font-weight: 800;
    text-align: center;
  }
  .place :global(.medal) {
    width: 44px;
    height: 44px;
  }
  .avatar {
    font-size: 2rem;
  }
  .name {
    flex: 1;
    font-weight: 750;
  }
  .score {
    font-weight: 800;
  }
</style>
