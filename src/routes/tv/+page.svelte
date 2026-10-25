<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { LEVELS, LEVEL_LABELS, THEMES, THEME_LABELS, type Level, type Theme } from '#lib/types.ts';
  import { writeToken } from '#lib/live-client/tokens.ts';
  import { LEVEL_EMOJI, THEME_EMOJI } from '#lib/ui/labels.ts';

  interface PlayerRow {
    id: number;
    name: string;
    avatar: string;
    level: Level;
  }
  interface TeamRow {
    id: number;
    name: string;
    avatar: string;
    member_ids: number[];
  }

  const COUNTS = [1, 2, 3, 4, 5];
  const TIMERS: (number | null)[] = [null, 20, 30, 45, 60];
  const SETTINGS_KEY = 'domaci-liga:live:setup';

  let loading = $state(true);
  let error = $state('');
  let busy = $state(false);
  let household = $state('');
  let players = $state<PlayerRow[]>([]);
  let teams = $state<TeamRow[]>([]);
  let selectedPlayers = $state<number[]>([]);
  let selectedTeams = $state<Record<number, Level>>({});
  let themes = $state<Theme[]>([]);
  let perContestant = $state(2);
  let timer = $state<number | null>(30);
  /** Evening the match belongs to (night pages link to /tv?night=<id>). */
  const nightParam = page.url.searchParams.get('night');
  const nightId = nightParam && /^\d{1,15}$/.test(nightParam) ? Number(nightParam) : null;

  const inTeam = $derived(new Set(Object.keys(selectedTeams).flatMap((id) => teams.find((t) => t.id === Number(id))?.member_ids ?? [])));
  const count = $derived(selectedPlayers.length + Object.keys(selectedTeams).length);
  const canStart = $derived(count > 0 && themes.length > 0 && !busy);

  async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (res.status === 401) {
      await goto('/', { replace: true });
      throw new Error('unauthorized');
    }
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  onMount(async () => {
    try {
      const me = await getJson<{ household: { name: string } | null }>('/api/me');
      if (!me.household) {
        await goto('/', { replace: true });
        return;
      }
      household = me.household.name;
      const [p, t] = await Promise.all([getJson<{ players: PlayerRow[] }>('/api/players'), getJson<{ teams: TeamRow[] }>('/api/teams')]);
      players = p.players;
      teams = t.teams;
      try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
        if (saved) {
          themes = (saved.themes ?? []).filter((x: Theme) => THEMES.includes(x));
          if (COUNTS.includes(saved.perContestant)) perContestant = saved.perContestant;
          if (TIMERS.includes(saved.timer)) timer = saved.timer;
          selectedPlayers = (saved.players ?? []).filter((id: number) => players.some((x) => x.id === id));
        }
      } catch {
        // ignore broken settings
      }
    } catch (err) {
      if ((err as Error).message !== 'unauthorized') error = (err as Error).message;
    } finally {
      loading = false;
    }
  });

  function togglePlayer(id: number) {
    selectedPlayers = selectedPlayers.includes(id) ? selectedPlayers.filter((x) => x !== id) : [...selectedPlayers, id];
  }

  function toggleTeam(team: TeamRow) {
    const next = { ...selectedTeams };
    if (next[team.id]) delete next[team.id];
    else {
      next[team.id] = 'hospoda';
      selectedPlayers = selectedPlayers.filter((id) => !team.member_ids.includes(id));
    }
    selectedTeams = next;
  }

  function toggleTheme(t: Theme) {
    themes = themes.includes(t) ? themes.filter((x) => x !== t) : [...themes, t];
  }

  async function start() {
    if (!canStart) return;
    busy = true;
    error = '';
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          player_ids: selectedPlayers,
          teams: Object.entries(selectedTeams).map(([id, level]) => ({ id: Number(id), level })),
          themes,
          questions_per_contestant: perContestant,
          timer_seconds: timer,
          ...(nightId !== null ? { night_id: nightId } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 401) return goto('/');
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      writeToken('host', body.code, body.host_token);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ themes, perContestant, timer, players: selectedPlayers }));
      } catch {
        // ignore
      }
      await goto(`/tv/${body.code}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Kvízovna · hra na televizi</title></svelte:head>

<main class="page stack">
  <header class="row head">
    <h1>📺 Hra na televizi</h1>
    {#if household}<span class="muted">{household}</span>{/if}
    <a class="btn small ghost" href="/">Zpět</a>
  </header>

  {#if loading}
    <p class="muted">Načítám hráče…</p>
  {:else}
    <section class="card stack">
      <h2>Kdo hraje</h2>
      {#if players.length === 0}
        <p class="muted">V domácnosti zatím nejsou hráči. Přidej je na <a href="/hraci">stránce hráčů</a>.</p>
      {/if}
      <div class="row" role="group" aria-label="Hráči">
        {#each players as p (p.id)}
          <button
            class="chip"
            aria-pressed={selectedPlayers.includes(p.id)}
            disabled={inTeam.has(p.id)}
            onclick={() => togglePlayer(p.id)}
            aria-label={`${p.name} hraje`}
          >
            <span class="emoji">{p.avatar}</span> {p.name} <span class="badge {p.level}">{LEVEL_EMOJI[p.level]} {LEVEL_LABELS[p.level]}</span>
          </button>
        {/each}
      </div>
      {#if teams.length}
        <h3>Týmy</h3>
        {#each teams as t (t.id)}
          <div class="row team">
            <button class="chip" aria-pressed={!!selectedTeams[t.id]} onclick={() => toggleTeam(t)} aria-label={`Tým ${t.name} hraje`}>
              <span class="emoji">{t.avatar}</span> {t.name}
            </button>
            {#if selectedTeams[t.id]}
              <div class="row" role="group" aria-label={`Úroveň týmu ${t.name}`}>
                {#each LEVELS as level (level)}
                  <button class="chip" aria-pressed={selectedTeams[t.id] === level} onclick={() => (selectedTeams = { ...selectedTeams, [t.id]: level })}>
                    {LEVEL_EMOJI[level]} {LEVEL_LABELS[level]}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
      <p class="muted">Kdo nemá telefon (třeba předškolák), toho v čekárně přepneš na „hraje na TV“.</p>
    </section>

    <section class="card stack">
      <h2>Témata (jedno kolo = jedno téma)</h2>
      <div class="row" role="group" aria-label="Témata">
        {#each THEMES as t (t)}
          <button class="chip" aria-pressed={themes.includes(t)} onclick={() => toggleTheme(t)}>
            <span class="emoji">{THEME_EMOJI[t]}</span> {THEME_LABELS[t]}
          </button>
        {/each}
      </div>
    </section>

    <section class="card stack">
      <h2>Nastavení</h2>
      <div class="row" role="group" aria-label="Otázek na hráče v kole">
        <span class="label">Otázek na hráče v kole</span>
        {#each COUNTS as n (n)}
          <button class="chip" aria-pressed={perContestant === n} onclick={() => (perContestant = n)}>{n}</button>
        {/each}
      </div>
      <div class="row" role="group" aria-label="Časovač">
        <span class="label">Časovač</span>
        {#each TIMERS as t (t ?? 'none')}
          <button class="chip" aria-pressed={timer === t} onclick={() => (timer = t)}>{t === null ? 'Bez časovače' : `${t} s`}</button>
        {/each}
      </div>
      <p class="muted">Pískoviště hraje vždy bez časovače.</p>
    </section>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="row">
      <button class="btn primary big" disabled={!canStart} onclick={start}>📺 Založit místnost</button>
    </div>
  {/if}
</main>

<style>
  .head h1 {
    margin: 0;
    flex: 1;
  }
  .label {
    font-weight: 700;
    min-width: 12em;
  }
  .team {
    align-items: center;
  }
  .error {
    color: var(--bad);
    font-weight: 700;
  }
</style>
