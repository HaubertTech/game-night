<script lang="ts">
  import { goto } from '$app/navigation';
  import Owl from '#lib/ui/art/Owl.svelte';

  let code = $state('');
  const clean = $derived(code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (clean.length >= 4) goto(`/m/${clean}`);
  }
</script>

<svelte:head><title>Připojit telefon · Herní večer</title></svelte:head>

<main class="phone stack">
  <h1>Připojit se ke hře</h1>
  <Owl pose="mava" text="Kód místnosti je velkým písmem na televizi." />
  <form class="stack" onsubmit={submit}>
    <label class="visually-hidden" for="room-code">Kód místnosti</label>
    <input id="room-code" type="text" bind:value={code} autocomplete="off" autocapitalize="characters" placeholder="např. KX7P" maxlength="8" />
    <button class="btn primary big" type="submit" disabled={clean.length < 4}>Připojit</button>
  </form>
</main>

<style>
  .phone {
    max-width: 480px;
    margin: 0 auto;
    padding: 24px 16px;
  }
  input {
    text-align: center;
    font-size: 2.4rem !important;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
</style>
