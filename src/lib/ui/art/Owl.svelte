<script lang="ts">
  // Sova Moderátorka as the guide: the mascot picture and a speech bubble.
  import type { Snippet } from 'svelte';
  import Art from './Art.svelte';

  type Pose = 'mava' | 'otazka' | 'slavi' | 'premysli';
  let {
    pose,
    mood,
    text,
    compact = false,
    children,
  }: { pose?: Pose; /** Same as `pose` (chess screens). */ mood?: Pose; text: string; compact?: boolean; children?: Snippet } = $props();

  const name = $derived(`mascot.sova-${pose ?? mood ?? 'mava'}`);
</script>

<div class="owl" class:compact data-testid="owl" aria-live="polite">
  <Art {name} size={compact ? 60 : 96} class="owl-img" eager />
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
  .owl :global(.owl-img) {
    width: 96px;
    height: 96px;
    flex: none;
    object-fit: contain;
  }
  .compact :global(.owl-img) {
    width: 60px;
    height: 60px;
  }
  .bubble {
    position: relative;
    flex: 1;
    min-width: 0;
    background: var(--paper);
    border: 2px solid var(--line);
    border-radius: var(--radius);
    padding: 12px 16px;
    box-shadow: var(--shadow);
  }
  .bubble::before {
    content: '';
    position: absolute;
    left: -10px;
    bottom: 18px;
    border: 8px solid transparent;
    border-right-color: var(--line);
    border-left: 0;
  }
  .bubble p {
    margin: 0;
    font-weight: 650;
    font-size: 1.08rem;
  }
  .compact .bubble {
    padding: 10px 14px;
  }
  .compact .bubble p {
    font-size: 1rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
</style>
