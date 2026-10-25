<script lang="ts">
  // The player's hand as a fan at the bottom of the table. A card is played by a tap or by
  // dragging it up towards the table.
  import Card from './Card.svelte';
  import { fanLayout } from './fan-layout.ts';

  interface Props {
    cards: string[];
    selected?: string[];
    /** Cards that may be played now (hint highlight). */
    playable?: string[] | null;
    /** The card the owl recommends. */
    advised?: string[];
    disabled?: boolean;
    onTap: (id: string) => void;
    label?: string;
  }

  let { cards, selected = [], playable = null, advised = [], disabled = false, onTap, label = 'Moje karty' }: Props = $props();

  let fanWidth = $state(800);
  const layout = $derived(fanLayout(cards.length, fanWidth));
  const cardWidth = $derived(layout.cardWidth);

  let drag: { id: string; y: number; dy: number } | null = $state(null);

  function down(e: PointerEvent, id: string) {
    if (disabled) return;
    drag = { id, y: e.clientY, dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (drag) drag = { ...drag, dy: Math.min(0, e.clientY - drag.y) };
  }
  function up(id: string) {
    const d = drag;
    drag = null;
    // A short tap or a drag upwards; a drag sideways or down does nothing.
    if (d && d.id === id && (Math.abs(d.dy) < 8 || d.dy < -40)) onTap(id);
  }
  function key(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled) onTap(id);
    }
  }
</script>

<div class="hand" bind:clientWidth={fanWidth} role="group" aria-label={label} data-testid="hand">
  <div class="fan" class:two-rows={layout.rows === 2} style="width:{layout.width}px;height:{layout.height}px">
    {#each cards as id, i (id)}
      {@const slot = layout.slots[i] ?? { x: 0, y: 0, rot: 0 }}
      {@const rot = slot.rot}
      {@const lift = selected.includes(id) ? 22 : drag?.id === id ? -drag.dy : 0}
      <button
        type="button"
        class="slot"
        class:playable={playable?.includes(id)}
        class:dim={playable !== null && !playable.includes(id)}
        class:advised={advised.includes(id)}
        class:selected={selected.includes(id)}
        style="left:{slot.x}px;top:{slot.y}px;transform:translateY({-lift + Math.abs(rot) * 0.6}px) rotate({rot}deg)"
        aria-pressed={selected.includes(id)}
        data-testid="hand-card"
        data-card={id}
        data-playable={playable?.includes(id) ? 'true' : 'false'}
        onpointerdown={(e) => down(e, id)}
        onpointermove={move}
        onpointerup={() => up(id)}
        onpointercancel={() => (drag = null)}
        onkeydown={(e) => key(e, id)}
        {disabled}
      >
        <Card {id} width={cardWidth} />
      </button>
    {/each}
  </div>
</div>

<style>
  .hand {
    width: 100%;
    display: flex;
    justify-content: center;
    padding-top: 12px;
    overflow: visible;
  }
  .fan {
    position: relative;
  }
  .slot {
    position: absolute;
    padding: 0;
    border: 0;
    background: none;
    border-radius: 10px;
    transform-origin: 50% 120%;
    transition: transform 160ms ease, filter 160ms ease;
    touch-action: none;
  }
  .slot.dim {
    filter: brightness(0.82) saturate(0.7);
  }
  .slot.playable :global(svg) {
    outline: 3px solid var(--sage);
    outline-offset: 1px;
    border-radius: 10px;
  }
  .slot.advised :global(svg) {
    outline: 4px solid var(--clay);
    outline-offset: 2px;
    border-radius: 10px;
  }
  .slot.selected :global(svg) {
    outline: 4px solid var(--slate-dark);
    outline-offset: 1px;
    border-radius: 10px;
  }
  .slot:disabled {
    opacity: 1;
    cursor: default;
  }
  @media (prefers-reduced-motion: reduce) {
    .slot {
      transition: none;
    }
  }
</style>
