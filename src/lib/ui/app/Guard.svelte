<script lang="ts">
  import type { Snippet } from 'svelte';
  import { session } from './session.svelte.ts';

  let { children }: { children: Snippet } = $props();
</script>

{#if !session.loaded}
  <p class="muted guard">Načítám…</p>
{:else if session.household}
  {@render children()}
{:else}
  <section class="card stack guard">
    <h2>Nejdřív se přihlas</h2>
    <p class="muted">
      {session.offline ? 'Server teď není dostupný. Kvízovna na tabletu, šachy a trénink karet fungují i bez něj.' : 'Tahle stránka patří domácnosti. Přihlas se e-mailem a heslem, nebo PINem na zařízení domácnosti.'}
    </p>
    <div class="row">
      <a class="btn primary" href="/">Přihlásit</a>
      <a class="btn ghost" href="/tablet">🦉 Kvízovna na tabletu</a>
    </div>
  </section>
{/if}

<style>
  .guard {
    max-width: 640px;
    margin: 24px auto;
  }
</style>
