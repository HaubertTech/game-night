<script lang="ts">
  import type { Standing } from '../engine/quiz.ts';
  import { pointsLabel } from './labels.ts';

  let { rows, showRound = true }: { rows: Standing[]; showRound?: boolean } = $props();
  const MEDALS = ['🥇', '🥈', '🥉'];
</script>

<ol class="standings" data-testid="standings">
  {#each rows as row (row.contestant.id)}
    <li class:first={row.place === 1}>
      <span class="place">{row.place <= 3 ? MEDALS[row.place - 1] : `${row.place}.`}</span>
      <span class="emoji avatar">{row.contestant.avatar}</span>
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
    background: #fff;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: 1.25rem;
  }
  li.first {
    border-color: var(--clay);
    background: var(--clay-light);
  }
  .place {
    width: 2.2em;
    font-size: 1.6rem;
    text-align: center;
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
