<script lang="ts">
  import { LEVEL_LABELS, type Level } from '../../types.ts';
  import { LEVEL_EMOJI } from '../labels.ts';
  import type { Presence } from '../../live/protocol.ts';

  interface Seat {
    id: string;
    name: string;
    avatar: string;
    level: Level;
    group?: string;
  }
  let { seats, presence, onPick }: { seats: Seat[]; presence: Record<string, Presence>; onPick: (id: string) => void } = $props();
</script>

<section class="stack" data-testid="picker">
  <h1>Kdo jsi?</h1>
  <div class="pick">
    {#each seats as c (c.id)}
      {@const taken = presence[c.id]?.claimed}
      <button class="who" disabled={taken} onclick={() => onPick(c.id)} aria-label={`Jsem ${c.name}`}>
        <span class="emoji avatar">{c.avatar}</span>
        <span class="name">{c.name}</span>
        <span class="badge {c.level}">{LEVEL_EMOJI[c.level]} {LEVEL_LABELS[c.level]}</span>
        {#if c.group}<span class="muted small">{c.group}</span>{/if}
        {#if taken}<span class="muted small">už hraje jiný telefon</span>{/if}
      </button>
    {/each}
  </div>
</section>

<style>
  .pick {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .who {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    min-height: 84px;
    padding: 12px 18px;
    border: 2px solid var(--ink);
    border-radius: var(--radius-sm);
    background: #fff;
    box-shadow: 0 3px 0 var(--ink);
    text-align: left;
  }
  .who:disabled {
    opacity: 0.45;
    box-shadow: none;
  }
  .avatar {
    font-size: 2.6rem;
  }
  .name {
    font-size: 1.4rem;
    font-weight: 800;
  }
  .small {
    font-size: 0.9rem;
    width: 100%;
  }
</style>
