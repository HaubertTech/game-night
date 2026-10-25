<script lang="ts">
  import { api, ApiError, formatDate, GAME_EMOJI, GAME_LABELS } from '#lib/ui/app/api.ts';
  import Guard from '#lib/ui/app/Guard.svelte';
  import LeagueTable from '#lib/ui/app/LeagueTable.svelte';
  import Medal from '#lib/ui/app/Medal.svelte';
  import Art from '#lib/ui/art/Art.svelte';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import { session } from '#lib/ui/app/session.svelte.ts';

  import { GAME_TYPES, type GameType } from '#lib/league/types.ts';
  interface Season {
    id: number;
    name: string;
    starts_on: string;
    ends_on: string;
    points_table: number[];
  }
  interface Row {
    playerId: string;
    points: number;
    matches: number;
    wins: number;
    average: number;
    place: number;
  }
  interface Tables {
    standings: Row[];
    byGameType: Record<GameType, Row[]>;
    matches: number;
    names: Record<string, string>;
  }
  interface Leader {
    player_id: number;
    name: string;
    avatar: string;
    display: number;
    games: number;
    place: number;
  }
  interface Records {
    bestQuizScore: { playerIds: string[]; score: number } | null;
    longestAnswerStreak: { playerId: string; length: number } | null;
    longestWinStreak: { playerId: string; length: number } | null;
    mostWinsInNight: { playerId: string; nightId: string; wins: number } | null;
    names: Record<string, string>;
  }

  let seasons = $state<Season[]>([]);
  /** Season id, or 'all'. */
  let selected = $state<string>('all');
  let tables = $state<Tables | null>(null);
  let gameTab = $state<GameType>('quiz');
  let ratingTab = $state<GameType>('quiz');
  let ratings = $state<Record<GameType, Leader[]> | null>(null);
  let records = $state<Records | null>(null);
  let message = $state<string | null>(null);

  let showForm = $state(false);
  let formName = $state('');
  let formStart = $state('');
  let formEnd = $state('');
  let formTable = $state('10, 7, 5, 3, 2, 1');
  let busy = $state(false);

  $effect(() => {
    if (session.household) init();
  });

  async function init() {
    try {
      const [s, r, rec] = await Promise.all([
        api<{ seasons: Season[]; current: Season | null }>('/api/seasons'),
        api<{ ratings: Record<GameType, Leader[]> }>('/api/stats/ratings'),
        api<{ records: Records }>('/api/stats/records'),
      ]);
      seasons = s.seasons;
      ratings = r.ratings;
      records = rec.records;
      selected = s.current ? String(s.current.id) : 'all';
      await loadTables();
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Ligu se nepodařilo načíst.';
    }
  }

  async function loadTables() {
    try {
      tables = await api<Tables>(selected === 'all' ? '/api/stats/overall' : `/api/seasons/${selected}`);
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Tabulku se nepodařilo načíst.';
    }
  }

  function select(id: string) {
    selected = id;
    loadTables();
  }

  const season = $derived(seasons.find((s) => String(s.id) === selected) ?? null);
  const todayIso = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
  /** Leader of the selected season: the champion once the season is over. */
  const leader = $derived.by(() => {
    if (!season || !tables) return null;
    const top = tables.standings.filter((r) => r.place === 1 && r.matches > 0);
    if (top.length === 0) return null;
    return { names: top.map((r) => tables!.names[r.playerId] ?? '?'), points: top[0].points, over: season.ends_on < todayIso };
  });

  async function createSeason(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    message = null;
    try {
      const points = formTable
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map(Number);
      const { season } = await api<{ season: Season }>('/api/seasons', { body: { name: formName, starts_on: formStart, ends_on: formEnd, points_table: points } });
      seasons = [season, ...seasons].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));
      showForm = false;
      formName = '';
      select(String(season.id));
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Sezónu se nepodařilo založit.';
    } finally {
      busy = false;
    }
  }

  function n(id: string | undefined): string {
    return (id && records?.names[id]) || '?';
  }
</script>

<svelte:head><title>Liga · Herní večer</title></svelte:head>

<main class="page stack">
  <header class="page-head">
    <Art name="cards.liga" sizes="160px" class="head-art" decorative eager />
    <div>
      <h1 class="section-title">Liga</h1>
      <p class="muted">Body za umístění ze všech her, sezóny a ratingy.</p>
    </div>
  </header>
  <Guard>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}

    <section class="card stack">
      <div class="row between">
        <div class="pill-tabs" role="group" aria-label="Sezóna">
          {#each seasons as s (s.id)}
            <button class="chip" aria-pressed={selected === String(s.id)} onclick={() => select(String(s.id))}>{s.name}</button>
          {/each}
          <button class="chip" aria-pressed={selected === 'all'} onclick={() => select('all')}>Celkově</button>
        </div>
        <button class="btn small" onclick={() => (showForm = !showForm)}>➕ Nová sezóna</button>
      </div>

      {#if showForm}
        <form class="stack season-form" onsubmit={createSeason}>
          <div class="row">
            <label class="field grow"><span>Název</span><input type="text" bind:value={formName} maxlength="60" placeholder="např. Zima 2026" /></label>
            <label class="field"><span>Od</span><input type="date" bind:value={formStart} /></label>
            <label class="field"><span>Do</span><input type="date" bind:value={formEnd} /></label>
          </div>
          <label class="field"><span>Body za umístění (1., 2., 3. …)</span><input type="text" bind:value={formTable} /></label>
          <span class="muted">Kdo skončí dál, než sahá tabulka, dostane 1 bod za účast. Shodné umístění si body dělí.</span>
          <div><button class="btn primary" type="submit" disabled={busy || !formName.trim() || !formStart || !formEnd}>Založit sezónu</button></div>
        </form>
      {/if}

      {#if season}
        <p class="muted">{formatDate(season.starts_on)} – {formatDate(season.ends_on)} · body {season.points_table.join(' – ')}</p>
      {:else if selected === 'all'}
        <p class="muted">Všechny dohrané partie, výchozí body 10 – 7 – 5 – 3 – 2 – 1.</p>
      {/if}
      {#if leader}
        <div class="champion" data-testid="season-leader">
          <Art name="rewards.sampion-sezony" size={72} decorative />
          <p>
            <span class="muted">{leader.over ? 'Šampion sezóny' : 'Sezónu vede'}</span><br />
            <strong>{leader.names.join(', ')}</strong> <span class="muted">· {leader.points} b.</span>
          </p>
        </div>
      {/if}
      {#if tables}
        <h2 class="section-title">Tabulka {season ? 'sezóny' : ''} <span class="muted">({tables.matches} partií)</span></h2>
        <LeagueTable rows={tables.standings} names={tables.names} testid="season-table" />
      {/if}
    </section>

    {#if tables}
      <section class="card stack">
        <h2 class="section-title">Podle her</h2>
        <div class="pill-tabs" role="group" aria-label="Tabulka podle hry">
          {#each GAME_TYPES as t (t)}
            <button class="chip" aria-pressed={gameTab === t} onclick={() => (gameTab = t)}>{GAME_EMOJI[t]} {GAME_LABELS[t]}</button>
          {/each}
        </div>
        <LeagueTable rows={tables.byGameType[gameTab]} names={tables.names} testid="game-table" empty="V téhle hře zatím nic." />
      </section>
    {/if}

    {#if ratings}
      <section class="card stack">
        <h2 class="section-title">Žebříček ratingů</h2>
        <p class="muted">Rating se počítá zvlášť pro každou hru (OpenSkill). Nový hráč začíná kolem 1000 a s každou partií se zpřesňuje.</p>
        <div class="pill-tabs" role="group" aria-label="Rating podle hry">
          {#each GAME_TYPES as t (t)}
            <button class="chip" aria-pressed={ratingTab === t} onclick={() => (ratingTab = t)}>{GAME_EMOJI[t]} {GAME_LABELS[t]}</button>
          {/each}
        </div>
        {#if ratings[ratingTab].length === 0}
          <p class="empty">Zatím bez hodnocené partie.</p>
        {:else}
          <div class="table-scroll">
            <table class="table" data-testid="ratings-table">
              <thead><tr><th>#</th><th>Hráč</th><th class="num">Rating</th><th class="num">Partie</th></tr></thead>
              <tbody>
                {#each ratings[ratingTab] as r (r.player_id)}
                  <tr class:first={r.place === 1}>
                    <td><Medal place={r.place} /></td>
                    <td><Avatar value={r.avatar} /> <a href={`/hrac/${r.player_id}`}>{r.name}</a></td>
                    <td class="num">{r.display}</td>
                    <td class="num">{r.games}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {/if}

    {#if records}
      <section class="card stack">
        <h2 class="section-title">Rekordy domácnosti</h2>
        <ul class="records">
          <li><span class="muted">Nejvíc bodů v kvízu</span><strong>{records.bestQuizScore ? `${records.bestQuizScore.score} · ${records.bestQuizScore.playerIds.map(n).join(', ')}` : '–'}</strong></li>
          <li><span class="muted">Nejdelší série správných odpovědí</span><strong>{records.longestAnswerStreak ? `${records.longestAnswerStreak.length} · ${n(records.longestAnswerStreak.playerId)}` : '–'}</strong></li>
          <li><span class="muted">Nejdelší série výher</span><strong>{records.longestWinStreak ? `${records.longestWinStreak.length} · ${n(records.longestWinStreak.playerId)}` : '–'}</strong></li>
          <li>
            <span class="muted">Nejvíc výher za večer</span>
            <strong>
              {#if records.mostWinsInNight}<a href={`/vecery/${records.mostWinsInNight.nightId}`}>{records.mostWinsInNight.wins} · {n(records.mostWinsInNight.playerId)}</a>{:else}–{/if}
            </strong>
          </li>
        </ul>
      </section>
    {/if}
  </Guard>
</main>

<style>
  .page-head {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .page-head p {
    margin: 4px 0 0;
  }
  .page-head :global(.head-art) {
    width: 120px;
    border-radius: var(--radius-sm);
    flex: none;
  }
  .champion {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 16px;
    border: 2px solid var(--clay);
    border-radius: var(--radius-sm);
    background: var(--clay-light);
  }
  .champion p {
    margin: 0;
    font-size: 1.15rem;
  }
  .champion :global(img) {
    width: 72px;
    height: 72px;
  }
  @media (max-width: 560px) {
    .page-head :global(.head-art) {
      width: 84px;
    }
  }
  .season-form {
    border-top: 2px dashed var(--line);
    padding-top: 14px;
  }
  .records {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }
  .records li {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .records strong {
    font-size: 1.2rem;
  }
  .records a {
    color: inherit;
  }
</style>
