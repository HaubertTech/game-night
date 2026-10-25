<script lang="ts">
  import { onDestroy } from 'svelte';

  let { seconds, onTimeout }: { seconds: number; onTimeout: () => void } = $props();

  // The parent re-creates this component for every question ({#key}), so the start time is per question.
  const startedAt = Date.now();
  let now = $state(Date.now());
  const left = $derived(Math.max(0, seconds - (now - startedAt) / 1000));
  let fired = false;

  const interval = setInterval(() => {
    now = Date.now();
    if (left <= 0 && !fired) {
      fired = true;
      clearInterval(interval);
      onTimeout();
    }
  }, 200);

  onDestroy(() => clearInterval(interval));
</script>

<div class="timer" class:low={left <= 5} role="timer" aria-label={`Zbývá ${Math.ceil(left)} sekund`}>
  <div class="fill" style:width={`${(left / seconds) * 100}%`}></div>
  <span>⏳ {Math.ceil(left)} s</span>
</div>

<style>
  .timer {
    position: relative;
    height: 36px;
    border: 2px solid var(--line);
    border-radius: 999px;
    background: var(--paper);
    overflow: hidden;
    display: grid;
    place-items: center;
    font-weight: 700;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--sage-light);
    transition: width 200ms linear;
  }
  .low .fill {
    background: var(--bad-bg);
  }
  span {
    position: relative;
  }
</style>
