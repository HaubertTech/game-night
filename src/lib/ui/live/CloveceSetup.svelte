<script lang="ts">
  import ArtIcon from '#lib/ui/live/ArtIcon.svelte';
  import { LEVEL_ART } from '#lib/ui/art/art.ts';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  // TV setup of Člověče, nezlob se: people on phones, computers for the free seats (2–4 in all),
  // the owl's hints for children, the variants and an optional time limit per turn.
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { AI_LEVEL_LABELS } from '../../games/clovece/ai.ts';
  import { DEFAULT_SETTINGS, MAX_PLAYERS, type AiLevel, type CloveceSettings } from '../../games/clovece/engine.ts';
  import { LEVEL_LABELS, type Level } from '../../types.ts';
  import { createRoom, loadSetting, saveSetting } from './setup-api.ts';

  interface PlayerRow {
    id: number;
    name: string;
    avatar: string;
    level: Level;
  }
  let { players, nightId }: { players: PlayerRow[]; nightId: number | null } = $props();

  const KEY = 'domaci-liga:live:setup:clovece';
  const TURN_LIMITS: (number | null)[] = [null, 30, 60, 90];

  let selected = $state<number[]>([]);
  let computers = $state(1);
  let level = $state<AiLevel>(2);
  let hints = $state<number[]>([]);
  let turnSeconds = $state<number | null>(null);
  let settings = $state<CloveceSettings>({ ...DEFAULT_SETTINGS });
  let busy = $state(false);
  let error = $state('');

  onMount(() => {
    const saved = loadSetting<{ selected?: number[]; computers?: number; level?: AiLevel; hints?: number[]; turnSeconds?: number | null; settings?: CloveceSettings }>(KEY);
    if (!saved) return;
    selected = (saved.selected ?? []).filter((id) => players.some((p) => p.id === id)).slice(0, MAX_PLAYERS);
    if (Number.isInteger(saved.computers)) computers = Math.max(0, Math.min(3, saved.computers!));
    if (saved.level === 1 || saved.level === 2 || saved.level === 3) level = saved.level;
    hints = (saved.hints ?? []).filter((id) => selected.includes(id));
    if (saved.turnSeconds === null || TURN_LIMITS.includes(saved.turnSeconds ?? null)) turnSeconds = saved.turnSeconds ?? null;
    if (saved.settings) settings = { ...DEFAULT_SETTINGS, ...saved.settings };
  });

  const maxComputers = $derived(Math.max(0, Math.min(3, MAX_PLAYERS - selected.length)));
  const seats = $derived(selected.length + Math.min(computers, maxComputers));
  const ready = $derived(selected.length >= 1 && seats >= 2 && seats <= MAX_PLAYERS && !busy);

  function toggle(p: PlayerRow) {
    if (selected.includes(p.id)) {
      selected = selected.filter((x) => x !== p.id);
      hints = hints.filter((x) => x !== p.id);
      return;
    }
    if (selected.length >= MAX_PLAYERS) return;
    selected = [...selected, p.id];
    if (p.level !== 'hospoda' && !hints.includes(p.id)) hints = [...hints, p.id];
  }

  async function start() {
    if (!ready) return;
    busy = true;
    error = '';
    try {
      const result = await createRoom({
        game: 'clovece',
        player_ids: selected,
        computers: Math.min(computers, maxComputers),
        computer_level: level,
        hints_for: hints.filter((id) => selected.includes(id)),
        turn_seconds: turnSeconds,
        pawns: settings.pawns,
        capture: settings.capture,
        enter_on_one: settings.enterOnOne,
        three_tries: settings.threeTries,
        ...(nightId !== null ? { night_id: nightId } : {}),
      });
      if ('unauthorized' in result) return goto('/');
      saveSetting(KEY, { selected, computers, level, hints, turnSeconds, settings });
      await goto(`/tv/${result.code}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<section class="card stack">
  <h2>Kdo hraje na telefonu</h2>
  {#if players.length === 0}
    <p class="muted">V domácnosti zatím nejsou hráči. Přidej je na <a href="/hraci">stránce hráčů</a>.</p>
  {/if}
  <div class="row" role="group" aria-label="Hráči">
    {#each players as p (p.id)}
      <button class="chip" aria-pressed={selected.includes(p.id)} onclick={() => toggle(p)} aria-label={`${p.name} hraje`}>
        <span class="emoji"><Avatar value={p.avatar} /></span> {p.name} <span class="badge {p.level}"><ArtIcon name={LEVEL_ART[p.level]} /> {LEVEL_LABELS[p.level]}</span>
      </button>
    {/each}
  </div>
  {#if selected.length}
    <div class="row" role="group" aria-label="Nápovědy">
      <span class="label">Sova radí na telefonu</span>
      {#each players.filter((p) => selected.includes(p.id)) as p (p.id)}
        <button class="chip" aria-pressed={hints.includes(p.id)} onclick={() => (hints = hints.includes(p.id) ? hints.filter((x) => x !== p.id) : [...hints, p.id])} aria-label={`Nápovědy: ${p.name}`}>🦉 {p.name}</button>
      {/each}
    </div>
  {/if}
</section>

<section class="card stack">
  <h2>Počítač</h2>
  <div class="row" role="group" aria-label="Počet počítačů">
    <span class="label">Počet počítačů</span>
    {#each [0, 1, 2, 3] as n (n)}
      <button class="chip" aria-pressed={Math.min(computers, maxComputers) === n} disabled={n > maxComputers} onclick={() => (computers = n)}>{n}</button>
    {/each}
  </div>
  <div class="row" role="group" aria-label="Síla počítače">
    <span class="label">Síla</span>
    {#each [1, 2, 3] as const as l (l)}
      <button class="chip" aria-pressed={level === l} onclick={() => (level = l)}>{AI_LEVEL_LABELS[l]}</button>
    {/each}
  </div>
  <p class="muted">Hrají 2 až 4 hráči. Počítače doplní volná místa a hrají samy.</p>
</section>

<section class="card stack">
  <h2>Pravidla</h2>
  <div class="row" role="group" aria-label="Varianty">
    <button class="chip" aria-pressed={!settings.capture} onclick={() => (settings.capture = !settings.capture)}>🧸 Bez vyhazování</button>
    <button class="chip" aria-pressed={settings.enterOnOne} onclick={() => (settings.enterOnOne = !settings.enterOnOne)}>1️⃣ Nasazení i jedničkou</button>
    <button class="chip" aria-pressed={settings.pawns === 2} onclick={() => (settings.pawns = settings.pawns === 2 ? 4 : 2)}>⏱ Kratší hra (2 figurky)</button>
    <button class="chip" aria-pressed={settings.threeTries} onclick={() => (settings.threeTries = !settings.threeTries)}>🎲 Tři pokusy na šestku</button>
  </div>
  <div class="row" role="group" aria-label="Čas na tah">
    <span class="label">Čas na tah</span>
    {#each TURN_LIMITS as t (t ?? 'none')}
      <button class="chip" aria-pressed={turnSeconds === t} onclick={() => (turnSeconds = t)}>{t === null ? 'Bez limitu' : `${t} s`}</button>
    {/each}
  </div>
</section>

{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="row">
  <button class="btn primary big" disabled={!ready} onclick={start}>📺 Založit místnost</button>
</div>

<style>
  .label {
    font-weight: 700;
    min-width: 12em;
  }
  .error {
    color: var(--bad);
    font-weight: 700;
  }
</style>
