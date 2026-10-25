<script lang="ts">
  import ArtIcon from '#lib/ui/live/ArtIcon.svelte';
  import { LEVEL_ART } from '#lib/ui/art/art.ts';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import { LEVEL_LABELS } from '../types.ts';
  import type { Contestant } from '../engine/select.ts';

  let { contestant, joker = false, size = 'normal' }: { contestant: Contestant; joker?: boolean; size?: 'normal' | 'big' } = $props();
</script>

<span class="tag {size}">
  <span class="emoji avatar"><Avatar value={contestant.avatar} /></span>
  <span class="name">{contestant.name}</span>
  <span class="badge {contestant.level}"><ArtIcon name={LEVEL_ART[contestant.level]} /> {LEVEL_LABELS[contestant.level]}</span>
  {#if joker}<span class="badge joker" title="Žolík: body v tomto kole ×2">🃏 ×2</span>{/if}
</span>

<style>
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .avatar {
    font-size: 1.8rem;
  }
  .name {
    font-weight: 800;
    font-size: 1.2rem;
  }
  .big .avatar {
    font-size: 5rem;
  }
  .big .name {
    font-size: 2.4rem;
  }
  .big {
    flex-direction: column;
    gap: 8px;
  }
  .joker {
    background: var(--clay);
    color: var(--paper);
  }
</style>
