<script lang="ts">
  let { seconds, total }: { seconds: number | null; total: number | null } = $props();
  const pct = $derived(seconds === null || !total ? 100 : Math.max(0, Math.min(100, (seconds / total) * 100)));
</script>

{#if seconds !== null}
  <div class="timer" class:low={seconds <= 5} role="timer" aria-label={`Zbývá ${seconds} sekund`} data-testid="countdown">
    <div class="fill" style:width={`${pct}%`}></div>
    <span>⏳ {seconds} s</span>
  </div>
{/if}

<style>
  .timer {
    position: relative;
    height: 40px;
    border: 2px solid var(--line);
    border-radius: 999px;
    background: var(--paper);
    overflow: hidden;
    display: grid;
    place-items: center;
    font-weight: 800;
    font-size: 1.2rem;
    width: 100%;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--sage-light);
    transition: width 250ms linear;
  }
  .low .fill {
    background: var(--bad-bg);
  }
  span {
    position: relative;
  }
</style>
