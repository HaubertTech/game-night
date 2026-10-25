<script lang="ts">
  import Art from '#lib/ui/art/Art.svelte';
  import { THEME_ART } from '#lib/ui/art/art.ts';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import { THEME_LABELS, type Theme } from '../types.ts';
  import type { Contestant } from '../engine/select.ts';

  let {
    theme,
    roundNumber,
    roundCount,
    contestants,
    jokerState,
    onToggleJoker,
    onStart,
  }: {
    theme: Theme;
    roundNumber: number;
    roundCount: number;
    contestants: Contestant[];
    /** 'here' = joker played this round, 'free' = still available, 'used' = played earlier. */
    jokerState: (id: string) => 'here' | 'free' | 'used';
    onToggleJoker: (id: string) => void;
    onStart: () => void;
  } = $props();
</script>

<article class="intro" data-testid="round-intro">
  <p class="muted round">Kolo {roundNumber} z {roundCount}</p>
  <Art name={THEME_ART[theme]} decorative size={160} class="theme-art" eager />
  <h1>{THEME_LABELS[theme]}</h1>

  <section class="card jokers">
    <h2>🃏 Žolík</h2>
    <p class="muted">Každý ho má jednou za hru a zdvojnásobí si body v kole, které si teď vybere.</p>
    <div class="list">
      {#each contestants as c (c.id)}
        {@const state = jokerState(c.id)}
        <button
          class="joker"
          aria-pressed={state === 'here'}
          disabled={state === 'used'}
          aria-label={`Žolík ${c.name}`}
          onclick={() => onToggleJoker(c.id)}
        >
          <span class="emoji avatar"><Avatar value={c.avatar} /></span>
          <span class="name">{c.name}</span>
          <span class="state">{state === 'here' ? '🃏 ×2 v tomto kole' : state === 'used' ? 'už použil(a)' : 'nechat na později'}</span>
        </button>
      {/each}
    </div>
  </section>

  <button class="btn primary big" onclick={onStart}>▶️ Začít kolo</button>
</article>

<style>
  .intro {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
  }
  .round {
    font-size: 1.2rem;
    margin: 0;
    font-weight: 700;
  }
  .intro :global(.theme-art) {
    width: 160px;
    height: 160px;
  }
  h1 {
    font-size: clamp(2rem, 5vw, 3rem);
  }
  .jokers {
    width: min(100%, 760px);
    text-align: left;
  }
  .jokers h2 {
    margin: 0 0 4px;
  }
  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
    margin-top: 12px;
  }
  .joker {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-height: 92px;
    padding: 10px 14px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--paper);
    text-align: left;
  }
  .joker[aria-pressed='true'] {
    border-color: var(--clay-dark);
    background: var(--clay-light);
  }
  .joker:disabled {
    opacity: 0.5;
  }
  .avatar {
    font-size: 1.8rem;
  }
  .name {
    font-weight: 800;
    font-size: 1.15rem;
  }
  .state {
    font-size: 0.95rem;
    color: var(--ink-soft);
  }
</style>
