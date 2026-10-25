<script lang="ts">
  import { page } from '$app/state';
  import { LEVEL_LABELS, LEVELS, THEME_LABELS, type Level, type Theme } from '#lib/types.ts';
  import { LEVEL_EMOJI, THEME_EMOJI } from '#lib/ui/labels.ts';
  import { api, ApiError, formatDateTime, GAME_EMOJI, GAME_LABELS, percent } from '#lib/ui/app/api.ts';
  import Guard from '#lib/ui/app/Guard.svelte';
  import Medal from '#lib/ui/app/Medal.svelte';
  import Art from '#lib/ui/art/Art.svelte';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import { LEVEL_ART, THEME_ART } from '#lib/ui/art/art.ts';
  import { session } from '#lib/ui/app/session.svelte.ts';

  import type { GameType } from '#lib/league/types.ts';

  function czPlural(n: number, one: string, few: string, many: string): string {
    return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
  }
  const matchesLabel = (n: number) => czPlural(n, 'partie', 'partie', 'partií');
  const winsLabel = (n: number) => czPlural(n, 'výhra', 'výhry', 'výher');
  interface Rate {
    correct: number;
    total: number;
    rate: number;
  }
  interface Profile {
    player: { id: number; name: string; avatar: string; level: Level; birth_year: number | null; archived_at: string | null };
    ratings: { game_type: GameType; display: number; games: number }[];
    league: { points: number; matches: number; wins: number };
    answers: Rate & {
      byTheme: Partial<Record<Theme, Rate>>;
      byLevel: Partial<Record<Level, Rate>>;
      bestTheme: Theme | null;
      worstTheme: Theme | null;
      longestStreak: number;
      currentStreak: number;
    };
    winStreak: { longest: number; current: number };
    history: { match_id: number; game_type: GameType; night_id: number | null; finished_at: string; place: number | null; score: number; league_points: number; seats: number; team_name: string | null }[];
    headToHead: { opponentId: string; name: string; matches: number; wins: number; losses: number; draws: number }[];
  }

  let profile = $state<Profile | null>(null);
  let message = $state<string | null>(null);

  $effect(() => {
    const id = page.params.id;
    if (session.household && id) load(id);
  });

  async function load(id: string) {
    message = null;
    try {
      profile = await api<Profile>(`/api/stats/players/${id}`);
    } catch (err) {
      profile = null;
      message = err instanceof ApiError ? err.message : 'Profil se nepodařilo načíst.';
    }
  }

  const firstNight = $derived(profile ? profile.history.some((h) => h.night_id !== null) : false);

  const themes = $derived(
    profile
      ? (Object.entries(profile.answers.byTheme) as [Theme, Rate][]).sort((a, b) => b[1].rate - a[1].rate || b[1].total - a[1].total)
      : [],
  );
</script>

<svelte:head><title>{profile ? profile.player.name : 'Hráč'} · Herní večer</title></svelte:head>

<main class="page stack">
  <Guard>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}
    {#if profile}
      {@const p = profile.player}
      <header class="row head">
        <span class="avatar"><Avatar value={p.avatar} px={128} /></span>
        <div class="grow">
          <h1>{p.name}</h1>
          <div class="row meta">
            <span class="badge {p.level}">{LEVEL_EMOJI[p.level]} {LEVEL_LABELS[p.level]}</span>
            {#if p.birth_year}<span class="muted">nar. {p.birth_year}</span>{/if}
            {#if p.archived_at}<span class="muted">archivovaný</span>{/if}
          </div>
        </div>
      </header>

      <section class="cards3" data-testid="ratings">
        {#each profile.ratings as r (r.game_type)}
          <div class="card stat" data-testid={`rating-${r.game_type}`}>
            <span class="emoji">{GAME_EMOJI[r.game_type]}</span>
            <span class="label">Rating · {GAME_LABELS[r.game_type]}</span>
            <strong class="value">{r.display}</strong>
            <span class="muted">{r.games ? `${r.games} ${r.games === 1 ? 'hodnocená partie' : r.games < 5 ? 'hodnocené partie' : 'hodnocených partií'}` : 'zatím bez partie'}</span>
          </div>
        {/each}
      </section>

      {#if firstNight || profile.winStreak.longest >= 3 || profile.answers.longestStreak >= 5}
        <section class="card row badges" data-testid="rewards">
          {#if firstNight}
            <span class="reward"><Art name="rewards.prvni-vecer" size={56} decorative /><span><strong>První večer</strong><br /><span class="muted">má za sebou</span></span></span>
          {/if}
          {#if profile.winStreak.longest >= 3}
            <span class="reward"><Art name="rewards.serie" size={56} decorative /><span><strong>Série {profile.winStreak.longest} výher</strong><br /><span class="muted">za sebou</span></span></span>
          {/if}
          {#if profile.answers.longestStreak >= 5}
            <span class="reward"><Art name="rewards.serie" size={56} decorative /><span><strong>{profile.answers.longestStreak} správně v řadě</strong><br /><span class="muted">v kvízu</span></span></span>
          {/if}
        </section>
      {/if}

      <section class="cards3">
        <div class="card stat">
          <span class="label">Ligové body celkem</span>
          <strong class="value" data-testid="league-points">{profile.league.points}</strong>
          <span class="muted">{matchesLabel(profile.league.matches)} · {winsLabel(profile.league.wins)}</span>
        </div>
        <div class="card stat">
          <span class="label">Série výher</span>
          <strong class="value">{profile.winStreak.current}</strong>
          <span class="muted">nejdelší {profile.winStreak.longest}</span>
        </div>
        <div class="card stat">
          <span class="label">Kvíz: správně v řadě</span>
          <strong class="value">{profile.answers.currentStreak}</strong>
          <span class="muted">nejdelší {profile.answers.longestStreak}</span>
        </div>
      </section>

      <section class="card stack">
        <h2 class="section-title">Kvízovna po tématech</h2>
        {#if profile.answers.total === 0}
          <p class="empty">Zatím žádná odpověď v kvízu.</p>
        {:else}
          <p>
            Celkem {profile.answers.correct} z {profile.answers.total} správně ({percent(profile.answers.rate)}).
            {#if profile.answers.bestTheme}Nejlepší téma: <strong>{THEME_LABELS[profile.answers.bestTheme]}</strong>.{/if}
            {#if profile.answers.worstTheme}Nejslabší: <strong>{THEME_LABELS[profile.answers.worstTheme]}</strong>.{/if}
          </p>
          <ul class="bars">
            {#each themes as [theme, s] (theme)}
              <li>
                <span class="bar-label">
                  {#if THEME_ART[theme]}<Art name={THEME_ART[theme]} size={36} decorative class="theme-icon" />{:else}<span class="emoji">{THEME_EMOJI[theme] ?? '❓'}</span>{/if}
                  {THEME_LABELS[theme] ?? theme}
                </span>
                <span class="bar"><span style:width={`${Math.round(s.rate * 100)}%`}></span></span>
                <span class="bar-value">{percent(s.rate)} <span class="muted">({s.correct}/{s.total})</span></span>
              </li>
            {/each}
          </ul>
          <div class="row">
            {#each LEVELS as level (level)}
              {@const s = profile.answers.byLevel[level]}
              {#if s}<span class="badge level {level}"><Art name={LEVEL_ART[level]} size={24} decorative class="level-icon" /> {LEVEL_LABELS[level]}: {percent(s.rate)} ({s.correct}/{s.total})</span>{/if}
            {/each}
          </div>
        {/if}
      </section>

      <section class="card stack">
        <h2 class="section-title">Vzájemné souboje</h2>
        {#if profile.headToHead.length === 0}
          <p class="empty">Zatím žádná společná partie.</p>
        {:else}
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Soupeř</th><th class="num">Partie</th><th class="num">Výhry</th><th class="num">Prohry</th><th class="num">Remízy</th></tr></thead>
              <tbody>
                {#each profile.headToHead as h (h.opponentId)}
                  <tr><td><a href={`/hrac/${h.opponentId}`}>{h.name}</a></td><td class="num">{h.matches}</td><td class="num">{h.wins}</td><td class="num">{h.losses}</td><td class="num">{h.draws}</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>

      <section class="card stack">
        <h2 class="section-title">Historie partií</h2>
        {#if profile.history.length === 0}
          <p class="empty">Zatím žádná dohraná partie.</p>
        {:else}
          <div class="table-scroll">
            <table class="table" data-testid="history">
              <thead><tr><th>Kdy</th><th>Hra</th><th>Pořadí</th><th class="num">Skóre</th><th class="num">Body</th></tr></thead>
              <tbody>
                {#each profile.history as h (h.match_id)}
                  <tr>
                    <td>{#if h.night_id}<a href={`/vecery/${h.night_id}`}>{formatDateTime(h.finished_at)}</a>{:else}{formatDateTime(h.finished_at)}{/if}</td>
                    <td>{GAME_EMOJI[h.game_type]} {GAME_LABELS[h.game_type]}{#if h.team_name} <span class="muted">({h.team_name})</span>{/if}</td>
                    <td><Medal place={h.place} size={24} /> <span class="muted">z {h.seats}</span></td>
                    <td class="num">{h.score}</td>
                    <td class="num">{h.league_points}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {/if}
  </Guard>
</main>

<style>
  .head {
    gap: 16px;
  }
  .head h1 {
    margin: 0;
    font-size: 2.2rem;
  }
  .avatar {
    font-size: 5rem;
    line-height: 1;
    background: var(--sage-light);
    border-radius: var(--radius);
    padding: 8px;
  }
  .badges {
    gap: 18px;
  }
  .reward {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .reward :global(img) {
    width: 56px;
    height: 56px;
  }
  .bar-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .bar-label :global(.theme-icon) {
    width: 36px;
    height: 36px;
    flex: none;
  }
  .level :global(.level-icon) {
    display: inline-block;
    width: 24px;
    height: 24px;
    vertical-align: middle;
  }
  @media (max-width: 600px) {
    .avatar {
      font-size: 3.6rem;
    }
  }
  .meta {
    gap: 10px;
  }
  .cards3 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stat .emoji {
    font-size: 1.8rem;
  }
  .label {
    font-weight: 700;
    color: var(--ink-soft);
  }
  .value {
    font-size: 2.2rem;
    font-weight: 850;
  }
  .bars {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .bars li {
    display: grid;
    grid-template-columns: minmax(160px, 1.3fr) 2fr minmax(110px, auto);
    gap: 12px;
    align-items: center;
  }
  .bar {
    height: 18px;
    border-radius: 999px;
    background: var(--cream);
    border: 1px solid var(--line);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--sage);
  }
  .bar-value {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 600px) {
    .bars li {
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .bar-value {
      text-align: left;
    }
  }
</style>
