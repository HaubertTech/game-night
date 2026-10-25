<script lang="ts">
  // The die: pips on a wooden cube. A new roll (`rollKey` changes) tumbles for a moment before it
  // shows the value; with prefers-reduced-motion it shows the value at once. When `onRoll` is set
  // and `canRoll` is true the die is the „Hodit“ button.
  import { onDestroy } from 'svelte';

  let {
    value,
    rollKey = 0,
    canRoll = false,
    onRoll,
    size = 96,
    tint = 'var(--paper)',
    label = 'Hodit kostkou',
  }: {
    value: number | null;
    /** Changes with every roll (state seq), starts the tumble. */
    rollKey?: number;
    canRoll?: boolean;
    onRoll?: () => void;
    size?: number;
    tint?: string;
    label?: string;
  } = $props();

  const PIPS: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
  };

  // svelte-ignore state_referenced_locally
  let seenKey = rollKey;
  let shown = $state<number | null>(null);
  let tumbling = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  onDestroy(stopTimer);

  $effect(() => {
    const v = value;
    const key = rollKey;
    let reduce = false;
    try {
      reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduce = false;
    }
    if (key === seenKey || v === null || reduce) {
      seenKey = key;
      stopTimer();
      tumbling = false;
      shown = v;
      return;
    }
    seenKey = key;
    stopTimer();
    tumbling = true;
    let n = 0;
    timer = setInterval(() => {
      n += 1;
      shown = ((v + n * 4) % 6) + 1;
      if (n >= 6) {
        stopTimer();
        shown = v;
        tumbling = false;
      }
    }, 70);
  });

  const pips = $derived(shown ? PIPS[shown] : []);
</script>

{#snippet face()}
  <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" class:tumbling>
    <rect x="5" y="5" width="90" height="90" rx="20" fill={tint} stroke="var(--ink)" stroke-width="4" />
    {#each pips as [x, y] (`${x}-${y}`)}
      <circle cx={x} cy={y} r="8.5" fill="var(--ink)" />
    {/each}
    {#if shown === null}
      <text x="50" y="62" text-anchor="middle" font-size="34" fill="var(--ink-soft)">?</text>
    {/if}
  </svg>
{/snippet}

{#if onRoll}
  <button
    type="button"
    class="die-btn"
    disabled={!canRoll}
    onclick={() => onRoll?.()}
    aria-label={canRoll ? label : `Kostka: ${value ?? 'zatím nehozeno'}`}
    data-testid="clovece-roll"
    data-value={tumbling ? '' : (value ?? '')}
  >
    {@render face()}
    {#if canRoll}<span class="cta">Hodit</span>{/if}
  </button>
{:else}
  <div class="die" role="img" aria-label={`Kostka: ${value ?? 'zatím nehozeno'}`} data-testid="clovece-die" data-value={tumbling ? '' : (value ?? '')}>
    {@render face()}
  </div>
{/if}

<style>
  .die,
  .die-btn {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .die-btn {
    background: none;
    border: none;
    padding: 6px;
    cursor: pointer;
    min-height: 44px;
  }
  .die-btn:disabled {
    cursor: default;
  }
  .die-btn:not(:disabled) svg {
    filter: drop-shadow(0 4px 0 var(--clay-dark));
  }
  .cta {
    font-weight: 800;
    font-size: 1.1rem;
    padding: 4px 16px;
    border-radius: 999px;
    background: var(--sage-dark);
    color: var(--on-dark);
  }
  .tumbling {
    animation: tumble 420ms ease-out;
  }
  @keyframes tumble {
    0% {
      transform: rotate(-30deg) translateY(-14px);
    }
    40% {
      transform: rotate(20deg) translateY(4px);
    }
    70% {
      transform: rotate(-8deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tumbling {
      animation: none;
    }
  }
</style>
