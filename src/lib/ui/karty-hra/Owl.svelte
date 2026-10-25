<script lang="ts">
  // Sova as the guide: the mascot picture and a speech bubble.
  import type { Snippet } from 'svelte';
  import manifest from '../../../../static/art/manifest.json';
  import type { OwlPose } from '#lib/games/karty-hra/learn/lessons.ts';

  let { pose = 'mava', text, compact = false, children }: { pose?: OwlPose; text: string; compact?: boolean; children?: Snippet } = $props();

  const art = $derived((manifest as Record<string, { path: string; alt: string }>)[`mascot.sova-${pose}`]);
</script>

<div class="owl" class:compact data-testid="owl" aria-live="polite">
  {#if art}
    <img src={art.path} alt={art.alt} width="512" height="512" />
  {/if}
  <div class="bubble">
    <p>{text}</p>
    {#if children}<div class="actions">{@render children()}</div>{/if}
  </div>
</div>

<style>
  .owl {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }
  img {
    width: 92px;
    height: 92px;
    flex: none;
    object-fit: contain;
  }
  .compact img {
    width: 56px;
    height: 56px;
  }
  .bubble {
    position: relative;
    flex: 1;
    background: var(--paper);
    border: 2px solid var(--line);
    border-radius: var(--radius);
    padding: 10px 14px;
    box-shadow: var(--shadow);
  }
  .bubble::before {
    content: '';
    position: absolute;
    left: -10px;
    bottom: 16px;
    border: 8px solid transparent;
    border-right-color: var(--line);
    border-left: 0;
  }
  .bubble p {
    margin: 0;
    font-weight: 650;
    font-size: 1.05rem;
  }
  .compact .bubble p {
    font-size: 0.98rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
</style>
