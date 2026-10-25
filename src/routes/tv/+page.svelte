<script lang="ts">
  import ArtIcon from '#lib/ui/live/ArtIcon.svelte';
  import { LEVEL_ART, THEME_ART } from '#lib/ui/art/art.ts';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { LEVELS, LEVEL_AGES, LEVEL_LABELS, THEMES, THEME_LABELS, type Level, type Theme } from '#lib/types.ts';
  import { writeToken } from '#lib/live-client/tokens.ts';
  import { isRoomGame, ROOM_GAME_ART, ROOM_GAME_LABELS, ROOM_GAMES, type RoomGame } from '#lib/live/games.ts';
  import GameCard from '#lib/ui/art/GameCard.svelte';
  import AktivitySetup from '#lib/ui/live/AktivitySetup.svelte';
  import MjzSetup from '#lib/ui/live/MjzSetup.svelte';
  import ChessSetup from '#lib/ui/live/ChessSetup.svelte';
  import CardsSetup from '#lib/ui/live/CardsSetup.svelte';
  import CloveceSetup from '#lib/ui/live/CloveceSetup.svelte';

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
  /** Game picked on the cards; `?hra=<game>` preselects it (rozcestník, večer). */
  const gameParam = page.url.searchParams.get('hra');
  let game = $state<RoomGame>(isRoomGame(gameParam) ? gameParam : 'quiz');
  const GAME_HINTS: Record<RoomGame, string> = {
    quiz: 'Otázky na telefonech, každý na své úrovni.',
    aktivity: 'Týmy vysvětlují slova — slovem, pantomimou, kresbou.',
    mjz: 'Písmeno, kategorie, Stop! a hlasování o sporných odpovědích.',
    chess: 'Dva hráči na telefonech, televize ukazuje šachovnici a hodiny.',
    'prsi-hra': 'Karty na telefonech, stůl na televizi, počítač doplní hráče.',
    'zoliky-hra': 'Vykládání kombinací — ruka na telefonu, stůl na televizi.',
    clovece: 'Plán na televizi, každý hází a táhne ze svého mobilu.',
  };

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

<svelte:head><title>Hra na televizi · Herní večer</title></svelte:head>

<main class="page stack">
  <header class="row head">
    <h1>📺 Hra na televizi</h1>
    {#if household}<span class="muted">{household}</span>{/if}
    <a class="btn small ghost" href={nightId ? `/vecery/${nightId}` : '/'}>← Zpět</a>
  </header>

  <section class="games" role="group" aria-label="Hra">
    {#each ROOM_GAMES as g (g)}
      <GameCard art={ROOM_GAME_ART[g]} title={ROOM_GAME_LABELS[g]} text={GAME_HINTS[g]} small pressed={game === g} onclick={() => (game = g)} testid={`game-${g}`} />
    {/each}
  </section>

  {#if loading}
    <p class="muted">Načítám hráče…</p>
  {:else if game === 'aktivity'}
    <AktivitySetup {players} {nightId} />
  {:else if game === 'mjz'}
    <MjzSetup {players} {nightId} />
  {:else if game === 'chess'}
    <ChessSetup {players} {nightId} />
  {:else if game === 'prsi-hra' || game === 'zoliky-hra'}
    {#key game}<CardsSetup {players} {nightId} {game} />{/key}
  {:else if game === 'clovece'}
    <CloveceSetup {players} {nightId} />
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
            <span class="emoji"><Avatar value={p.avatar} px={96} /></span> {p.name} <span class="badge {p.level}"><ArtIcon name={LEVEL_ART[p.level]} /> {LEVEL_LABELS[p.level]}</span>
          </button>
        {/each}
      </div>
      {#if teams.length}
        <h3>Týmy</h3>
        {#each teams as t (t.id)}
          <div class="row team">
            <button class="chip" aria-pressed={!!selectedTeams[t.id]} onclick={() => toggleTeam(t)} aria-label={`Tým ${t.name} hraje`}>
              <span class="emoji"><Avatar value={t.avatar} px={96} /></span> {t.name}
            </button>
            {#if selectedTeams[t.id]}
              <div class="row" role="group" aria-label={`Úroveň týmu ${t.name}`}>
                {#each LEVELS as level (level)}
                  <button class="chip" aria-pressed={selectedTeams[t.id] === level} onclick={() => (selectedTeams = { ...selectedTeams, [t.id]: level })}>
                    <ArtIcon name={LEVEL_ART[level]} /> {LEVEL_LABELS[level]} <small class="level-age">{LEVEL_AGES[level]}</small>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
      <p class="muted">Kdo nemá telefon (třeba předškolák), toho v čekárně přepneš na „hraje na TV“. Kočárek hraje na TV s rodičem: rodič přečte otázku a u napodobování potvrdí ✓/✗.</p>
    </section>

    <section class="card stack">
      <h2>Témata (jedno kolo = jedno téma)</h2>
      <div class="row" role="group" aria-label="Témata">
        {#each THEMES as t (t)}
          <button class="chip" aria-pressed={themes.includes(t)} onclick={() => toggleTheme(t)}>
            <ArtIcon name={THEME_ART[t]} em={1.6} /> {THEME_LABELS[t]}
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
      <p class="muted">Kočárek a Pískoviště hrají vždy bez časovače, Prvňáček má o polovinu víc času.</p>
    </section>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="row">
      <button class="btn primary big" disabled={!canStart} onclick={start}>📺 Založit místnost</button>
    </div>
  {/if}
</main>

<style>
  .level-age {
    font-size: 0.8em;
    font-weight: 500;
    color: var(--ink-soft);
  }
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
  .games {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  @media (min-width: 1300px) {
    .games {
      grid-template-columns: repeat(7, minmax(0, 1fr));
    }
  }
  /* Phones: two columns, so the seven games fit on one or two screens and the setup follows. */
  @media (max-width: 640px) {
    .games {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
  }
</style>
