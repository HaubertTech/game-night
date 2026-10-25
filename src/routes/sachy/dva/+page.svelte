<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PlayerPicker from '#lib/ui/chess/PlayerPicker.svelte';
  import { saveGame, type Learner } from '#lib/ui/chess/storage.ts';
  import { loadProfiles, type Profile } from '#lib/storage.ts';
  import { createChessGame } from '#lib/games/chess/engine.ts';

  const CLOCKS = [
    { id: 'none', label: 'Bez hodin', minutes: 0, inc: 0 },
    { id: '5', label: '5 minut', minutes: 5, inc: 0 },
    { id: '10', label: '10 minut', minutes: 10, inc: 0 },
    { id: '15+5', label: '15 min + 5 s', minutes: 15, inc: 5 },
  ];

  let profiles = $state<Profile[]>([]);
  let white = $state<Learner | null>(null);
  let black = $state<Learner | null>(null);
  let clock = $state('none');

  onMount(() => {
    profiles = loadProfiles();
    const [a, b] = profiles;
    white = a ? { id: a.id, name: a.name, avatar: a.avatar, level: a.level } : { id: 'host-Bílý', name: 'Bílý', avatar: '⚪', level: 'hospoda' };
    black = b ? { id: b.id, name: b.name, avatar: b.avatar, level: b.level } : { id: 'host-Černý', name: 'Černý', avatar: '⚫', level: 'hospoda' };
  });

  const same = $derived(!!white && !!black && white.id === black.id);

  function swap() {
    [white, black] = [black, white];
  }

  function start() {
    if (!white || !black || same) return;
    const c = CLOCKS.find((x) => x.id === clock) ?? CLOCKS[0];
    const game = createChessGame({
      mode: 'local',
      white: { ...white },
      black: { ...black },
      allowUndo: false,
      clock: c.minutes ? { minutes: c.minutes, incrementSeconds: c.inc } : null,
    });
    saveGame('local', game);
    goto('/sachy/hra?m=local');
  }
</script>

<svelte:head><title>Šachy ve dvou · Domácí liga</title></svelte:head>

<main class="page stack">
  <a href="/sachy" class="btn small back">← Šachy</a>
  <h1>👫 Dva hráči u tabletu</h1>

  <section class="card stack">
    <h2>⚪ Bílé (začíná)</h2>
    <PlayerPicker {profiles} value={white} label="Bílé" guestName="Bílý" onchange={(p) => (white = p)} />
  </section>
  <div class="row"><button type="button" class="btn small" onclick={swap}>⇅ Prohodit barvy</button></div>
  <section class="card stack">
    <h2>⚫ Černé</h2>
    <PlayerPicker {profiles} value={black} label="Černé" guestName="Černý" onchange={(p) => (black = p)} />
  </section>

  <section class="card stack">
    <h2>Hodiny</h2>
    <div class="row" role="group" aria-label="Hodiny">
      {#each CLOCKS as c (c.id)}
        <button type="button" class="chip" aria-pressed={clock === c.id} onclick={() => (clock = c.id)}>{c.label}</button>
      {/each}
    </div>
  </section>

  {#if same}<p class="muted">Vyber dva různé hráče.</p>{/if}
  <button type="button" class="btn big primary" disabled={!white || !black || same} onclick={start}>Začít partii</button>
</main>

<style>
  .back {
    align-self: flex-start;
  }
</style>
