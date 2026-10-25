<script lang="ts">
  import type { Snippet } from 'svelte';

  type Mood = 'mava' | 'otazka' | 'slavi' | 'premysli';
  let { mood = 'mava', text, compact = false, children }: { mood?: Mood; text: string; compact?: boolean; children?: Snippet } = $props();

  // Paths and alt texts as in static/art/manifest.json (mascot.sova-*); static/ cannot be imported.
  const ART: Record<Mood, { path: string; alt: string }> = {
    mava: { path: '/art/mascot/sova-mava.webp', alt: 'Sova Moderátorka v pletené vestě mává na pozdrav' },
    otazka: { path: '/art/mascot/sova-otazka.webp', alt: 'Sova Moderátorka drží kartičku s otázkou' },
    slavi: { path: '/art/mascot/sova-slavi.webp', alt: 'Sova Moderátorka radostně slaví' },
    premysli: { path: '/art/mascot/sova-premysli.webp', alt: 'Sova Moderátorka přemýšlí' },
  };
  const art = $derived(ART[mood]);
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
    width: 96px;
    height: 96px;
    flex: none;
    object-fit: contain;
  }
  .compact img {
    width: 64px;
    height: 64px;
  }
  .bubble {
    position: relative;
    flex: 1;
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
</style>
