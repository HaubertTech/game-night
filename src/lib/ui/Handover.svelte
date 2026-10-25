<script lang="ts">
  import type { Contestant } from '../engine/select.ts';
  import ContestantTag from './ContestantTag.svelte';

  let { contestant, joker, mix, onReady }: { contestant: Contestant; joker: boolean; mix: boolean; onReady: () => void } = $props();
</script>

<article class="handover" data-testid="handover">
  <p class="muted pass">📲 Podej tablet</p>
  <h1 class="visually-hidden">Na řadě je {contestant.name}</h1>
  <p class="who">Na řadě je</p>
  <ContestantTag {contestant} {joker} size="big" />
  {#if mix}<p class="mix">🪣 Mix Pískoviště</p>{/if}
  <button class="btn primary big" onclick={onReady}>👋 Jsem tu, ukaž otázku</button>
</article>

<style>
  .handover {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    min-height: 60vh;
    text-align: center;
  }
  .pass {
    font-size: 1.3rem;
    margin: 0;
  }
  .who {
    font-size: 1.6rem;
    margin: 0;
  }
  .mix {
    margin: 0;
    padding: 6px 16px;
    border-radius: 999px;
    background: var(--sage-light);
    font-weight: 700;
  }
</style>
