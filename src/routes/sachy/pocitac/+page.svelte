<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PlayerPicker from '#lib/ui/chess/PlayerPicker.svelte';
  import { loadAiSetup, saveAiSetup, saveGame, type Learner as Picked } from '#lib/ui/chess/storage.ts';
  import { loadProfiles, type Profile } from '#lib/storage.ts';
  import { AI_LEVELS, AI_LEVEL_LABELS, type AiLevel } from '#lib/games/chess/ai.ts';
  import { createChessGame } from '#lib/games/chess/engine.ts';

  const AI_AVATAR: Record<AiLevel, string> = { 1: '🐣', 2: '🐰', 3: '🦊', 4: '🦡', 5: '🐺', 6: '🦉' };
  const SUGGESTED: Record<string, AiLevel> = { piskoviste: 1, lavice: 2, hospoda: 4 };

  let profiles = $state<Profile[]>([]);
  let player = $state<Picked | null>(null);
  let level = $state<AiLevel>(2);
  let color = $state<'w' | 'b' | 'random'>('w');
  let hints = $state(true);

  onMount(() => {
    profiles = loadProfiles();
    const setup = loadAiSetup();
    level = (AI_LEVELS.includes(setup.level as AiLevel) ? setup.level : 2) as AiLevel;
    color = setup.color;
    hints = setup.hints;
    const p = profiles.find((x) => x.id === setup.playerId) ?? profiles[0];
    player = p ? { id: p.id, name: p.name, avatar: p.avatar, level: p.level } : { id: 'host-Ty', name: 'Ty', avatar: '🙂', level: 'lavice' };
  });

  function pick(p: Picked) {
    const changed = player?.id !== p.id;
    player = p;
    if (changed) level = SUGGESTED[p.level] ?? level;
  }

  function start() {
    if (!player) return;
    const human = { id: player.id, name: player.name, avatar: player.avatar, level: player.level };
    const ai = { id: 'ai', name: AI_LEVEL_LABELS[level].name, avatar: AI_AVATAR[level], aiLevel: level };
    const side = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    const game = createChessGame({ mode: 'ai', white: side === 'w' ? human : ai, black: side === 'w' ? ai : human, allowUndo: true });
    saveAiSetup({ level, color, playerId: player.id, hints });
    saveGame('ai', game);
    goto('/sachy/hra?m=ai');
  }
</script>

<svelte:head><title>Šachy s počítačem · Herní večer</title></svelte:head>

<main class="page stack">
  <a href="/sachy" class="btn small ghost back">← Šachy</a>
  <h1>🤖 Hrát s počítačem</h1>

  <section class="card stack">
    <h2>Kdo hraje</h2>
    <PlayerPicker {profiles} value={player} label="Hráč" guestName="Ty" onchange={pick} />
  </section>

  <section class="card stack">
    <h2>Síla soupeře</h2>
    <div class="levels" role="group" aria-label="Síla soupeře">
      {#each AI_LEVELS as l (l)}
        <button type="button" class="chip level" aria-pressed={level === l} onclick={() => (level = l)}>
          <span class="emoji" aria-hidden="true">{AI_AVATAR[l]}</span>
          <strong>{l}. {AI_LEVEL_LABELS[l].name}</strong>
          <span class="muted">{AI_LEVEL_LABELS[l].hint}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="card stack">
    <h2>Barva</h2>
    <div class="row" role="group" aria-label="Barva">
      <button type="button" class="chip" aria-pressed={color === 'w'} onclick={() => (color = 'w')}>⚪ Bílé (začínáš)</button>
      <button type="button" class="chip" aria-pressed={color === 'b'} onclick={() => (color = 'b')}>⚫ Černé</button>
      <button type="button" class="chip" aria-pressed={color === 'random'} onclick={() => (color = 'random')}>🎲 Náhodně</button>
    </div>
    <label class="toggle"><input type="checkbox" bind:checked={hints} /> Nápovědy od sovy (podle úrovně hráče)</label>
  </section>

  <button type="button" class="btn big primary" disabled={!player} onclick={start}>Začít partii</button>
</main>

<style>
  .back {
    align-self: flex-start;
  }
  .levels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
  }
  .level {
    flex-direction: column;
    align-items: flex-start;
    border-radius: var(--radius-sm);
    text-align: left;
    min-height: 96px;
  }
  .level .emoji {
    font-size: 1.8rem;
  }
  .toggle {
    display: inline-flex;
    gap: 10px;
    align-items: center;
    min-height: 48px;
    font-weight: 650;
  }
  .toggle input {
    width: 26px;
    height: 26px;
  }
</style>
