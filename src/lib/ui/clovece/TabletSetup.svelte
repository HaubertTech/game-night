<script lang="ts">
  // Setup of a tablet game: who plays (household players when logged in, otherwise profiles of
  // this tablet or just names), computers for the free seats, the owl's help per child and the
  // variants. Starting saves the game and opens /clovece/hra.
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createCloveceGame, DEFAULT_SETTINGS, MAX_PLAYERS, type AiLevel, type CloveceSettings } from '../../games/clovece/engine.ts';
  import { AI_LEVEL_LABELS } from '../../games/clovece/ai.ts';
  import { loadProfiles } from '../../storage.ts';
  import { LEVELS, LEVEL_LABELS, type Level } from '../../types.ts';
  import Avatar from '../art/Avatar.svelte';
  import { defaultHelp, leaguePlayerId, loadSetup, saveGame, saveSetup, type SeatHelp } from './storage.ts';

  let { seed = null, nightId = null }: { seed?: number | null; nightId?: number | null } = $props();

  interface Person {
    id: string;
    name: string;
    avatar: string;
    level: Level;
  }

  const COMPUTER_NAMES = ['Robík', 'Pixel', 'Bitka'];
  const COMPUTER_AVATAR = '🤖';

  let loading = $state(true);
  let league = $state(false);
  let people = $state<Person[]>([]);
  let guests = $state<Person[]>([]);
  let chosen = $state<string[]>([]);
  let computers = $state(1);
  let level = $state<AiLevel>(2);
  let settings = $state<CloveceSettings>({ ...DEFAULT_SETTINGS });
  let help = $state<Record<string, SeatHelp>>({});
  let guestName = $state('');
  let guestLevel = $state<Level>('lavice');

  async function householdPlayers(): Promise<Person[] | null> {
    try {
      const me = await fetch('/api/me');
      if (!me.ok || !(await me.json())?.household) return null;
      const res = await fetch('/api/players');
      if (!res.ok) return null;
      const body = (await res.json()) as { players: { id: number; name: string; avatar: string; level: Level }[] };
      return body.players.map((p) => ({ id: `p${p.id}`, name: p.name, avatar: p.avatar, level: p.level }));
    } catch {
      return null;
    }
  }

  onMount(async () => {
    const server = await householdPlayers();
    league = !!server && server.length > 0;
    people = league ? server! : loadProfiles().map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, level: p.level }));
    const saved = loadSetup();
    if (saved) {
      guests = (saved.guests ?? []).map((g) => ({ ...g, avatar: '🙂' }));
      const all = new Set([...people, ...guests].map((p) => p.id));
      chosen = (saved.people ?? []).filter((id) => all.has(id)).slice(0, MAX_PLAYERS);
      if (Number.isInteger(saved.computers)) computers = Math.max(0, Math.min(3, saved.computers));
      if (saved.level === 1 || saved.level === 2 || saved.level === 3) level = saved.level;
      if (saved.settings) settings = { ...DEFAULT_SETTINGS, ...saved.settings };
      help = saved.help ?? {};
    }
    loading = false;
  });

  const everyone = $derived([...people, ...guests]);
  const picked = $derived(chosen.map((id) => everyone.find((p) => p.id === id)).filter((p): p is Person => !!p));
  const maxComputers = $derived(Math.max(0, Math.min(3, MAX_PLAYERS - picked.length)));
  const computerCount = $derived(Math.min(computers, maxComputers));
  const seats = $derived(picked.length + computerCount);
  const ready = $derived(picked.length >= 1 && seats >= 2 && seats <= MAX_PLAYERS);
  const recorded = $derived(league && picked.every((p) => leaguePlayerId(p.id) !== null));

  function helpOf(p: Person): SeatHelp {
    return help[p.id] ?? defaultHelp(p.level);
  }

  function toggle(p: Person) {
    if (chosen.includes(p.id)) chosen = chosen.filter((x) => x !== p.id);
    else if (chosen.length < MAX_PLAYERS) chosen = [...chosen, p.id];
  }

  function addGuest(event: SubmitEvent) {
    event.preventDefault();
    const name = guestName.trim().slice(0, 24);
    if (!name) return;
    const g = { id: `host-${Date.now().toString(36)}`, name, avatar: '🙂', level: guestLevel };
    guests = [...guests, g];
    if (chosen.length < MAX_PLAYERS) chosen = [...chosen, g.id];
    guestName = '';
  }

  function setHelp(p: Person, key: keyof SeatHelp) {
    const h = helpOf(p);
    help = { ...help, [p.id]: { ...h, [key]: !h[key] } };
  }

  function start() {
    if (!ready) return;
    const players = [
      ...picked.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, level: p.level, ai: null })),
      ...Array.from({ length: computerCount }, (_, i) => ({ id: `ai${i + 1}`, name: COMPUTER_NAMES[i], avatar: COMPUTER_AVATAR, level: 'hospoda' as Level, ai: level })),
    ];
    const state = createCloveceGame({
      id: `tablet-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      createdAt: new Date().toISOString(),
      seed: seed ?? Math.floor(Math.random() * 2 ** 31),
      nightId: nightId === null ? null : String(nightId),
      settings: $state.snapshot(settings),
      players,
      now: Date.now(),
    });
    const seatHelp = Object.fromEntries(picked.map((p) => [p.id, helpOf(p)]));
    saveSetup({
      people: chosen,
      guests: guests.map(({ id, name, level: l }) => ({ id, name, level: l })),
      computers,
      level,
      settings: $state.snapshot(settings),
      help: $state.snapshot(help),
    });
    saveGame({ state, help: seatHelp, league: recorded, nightId, matchId: null });
    goto('/clovece/hra');
  }
</script>

{#if loading}
  <p class="muted">Načítám hráče…</p>
{:else}
  <section class="card stack">
    <h2>Kdo hraje</h2>
    {#if everyone.length}
      <div class="row" role="group" aria-label="Hráči">
        {#each everyone as p (p.id)}
          <button type="button" class="chip" aria-pressed={chosen.includes(p.id)} onclick={() => toggle(p)} aria-label={`${p.name} hraje`}>
            <span class="emoji"><Avatar value={p.avatar} /></span> {p.name}
          </button>
        {/each}
      </div>
    {:else}
      <p class="muted">Napiš jména hráčů. Po přihlášení domácnosti se nabídnou hráči z ligy.</p>
    {/if}
    <form class="row" onsubmit={addGuest}>
      <input type="text" bind:value={guestName} maxlength="24" placeholder="Jméno" aria-label="Jméno dalšího hráče" />
      <div class="row" role="group" aria-label="Úroveň dalšího hráče">
        {#each LEVELS as l (l)}
          <button type="button" class="chip" aria-pressed={guestLevel === l} onclick={() => (guestLevel = l)}>{LEVEL_LABELS[l]}</button>
        {/each}
      </div>
      <button class="btn small" type="submit" disabled={!guestName.trim()}>➕ Přidat</button>
    </form>
    {#if picked.length}
      <div class="stack tight" role="group" aria-label="Pomoc sovy">
        {#each picked as p (p.id)}
          {@const h = helpOf(p)}
          <div class="row help">
            <span class="label">{p.name}</span>
            <button type="button" class="chip" aria-pressed={h.hints} onclick={() => setHelp(p, 'hints')} aria-label={`Nápovědy sovy: ${p.name}`}>🦉 Nápovědy</button>
            <button type="button" class="chip" aria-pressed={h.speak} onclick={() => setHelp(p, 'speak')} aria-label={`Počítat nahlas: ${p.name}`}>🔊 Počítat nahlas</button>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="card stack">
    <h2>Počítač</h2>
    <div class="row" role="group" aria-label="Počet počítačů">
      <span class="label">Počet počítačů</span>
      {#each [0, 1, 2, 3] as n (n)}
        <button type="button" class="chip" aria-pressed={computerCount === n} disabled={n > maxComputers} onclick={() => (computers = n)}>{n}</button>
      {/each}
    </div>
    <div class="row" role="group" aria-label="Síla počítače">
      <span class="label">Síla</span>
      {#each [1, 2, 3] as const as l (l)}
        <button type="button" class="chip" aria-pressed={level === l} onclick={() => (level = l)}>{AI_LEVEL_LABELS[l]}</button>
      {/each}
    </div>
  </section>

  <section class="card stack">
    <h2>Pravidla</h2>
    <div class="row" role="group" aria-label="Varianty">
      <button type="button" class="chip" aria-pressed={!settings.capture} onclick={() => (settings.capture = !settings.capture)}>🧸 Bez vyhazování</button>
      <button type="button" class="chip" aria-pressed={settings.enterOnOne} onclick={() => (settings.enterOnOne = !settings.enterOnOne)}>1️⃣ Nasazení i jedničkou</button>
      <button type="button" class="chip" aria-pressed={settings.pawns === 2} onclick={() => (settings.pawns = settings.pawns === 2 ? 4 : 2)}>⏱ Kratší hra (2 figurky)</button>
      <button type="button" class="chip" aria-pressed={settings.threeTries} onclick={() => (settings.threeTries = !settings.threeTries)}>🎲 Tři pokusy na šestku</button>
    </div>
    <p class="muted">Hrají 2 až 4 hráči. Šestka nasazuje a hází se znovu, do domečku jen přesným hodem.</p>
  </section>

  <div class="row">
    <button class="btn primary big" disabled={!ready} onclick={start} data-testid="clovece-start">🎲 Začít hru</button>
    {#if ready}<span class="muted">{recorded ? 'Výsledek se zapíše do ligy.' : 'Hra se do ligy nezapisuje.'}</span>{/if}
  </div>
{/if}

<style>
  .label {
    font-weight: 700;
    min-width: 9em;
  }
  .tight {
    gap: 8px;
  }
  .help {
    align-items: center;
  }
</style>
