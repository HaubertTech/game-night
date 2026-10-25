<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { dev } from '$app/env';
  import { LEVELS, LEVEL_LABELS, THEMES, THEME_LABELS, PRESCHOOL_THEMES, type Level, type Theme } from '#lib/types.ts';
  import { countQuestions, loadQuestions } from '#lib/questions.ts';
  import { createGame, mulberry32, shuffle, type Contestant } from '#lib/engine/index.ts';
  import {
    clearCurrentGame,
    downloadHistory,
    loadCurrentGame,
    loadHistory,
    loadProfiles,
    loadSeen,
    newProfileId,
    saveCurrentGame,
    saveProfiles,
    type HistoryEntry,
    type Profile,
  } from '#lib/storage.ts';
  import { AVATARS, gamesLabel, LEVEL_EMOJI, TEAM_AVATARS, THEME_EMOJI } from '#lib/ui/labels.ts';
  import type { GameState } from '#lib/engine/quiz.ts';
  import { rememberTabletNight } from '#lib/ui/app/tablet-sync.ts';

  interface TeamDraft {
    id: string;
    name: string;
    avatar: string;
    level: Level;
    memberIds: string[];
  }

  const includeDraft = dev && page.url.searchParams.get('draft') === '1';
  // Opened from an evening (/tablet?night=ID): the finished game is recorded there.
  const nightId = Number(page.url.searchParams.get('night')) || null;
  const questions = loadQuestions({ includeDraft });
  const counts = countQuestions(questions);

  let profiles = $state<Profile[]>([]);
  let selected = $state<string[]>([]);
  let history = $state<HistoryEntry[]>([]);
  let running = $state<GameState | null>(null);

  let formName = $state('');
  let formAvatar = $state(AVATARS[0]);
  let formLevel = $state<Level>('hospoda');
  let editingId = $state<string | null>(null);

  let teamsMode = $state(false);
  let teams = $state<TeamDraft[]>([]);

  let themes = $state<Theme[]>([]);
  let perContestant = $state(3);
  let timer = $state<number | null>(null);

  onMount(() => {
    profiles = loadProfiles();
    selected = profiles.map((p) => p.id);
    history = loadHistory();
    const current = loadCurrentGame();
    running = current && current.phase !== 'finished' ? current : null;
    formAvatar = nextAvatar();
  });

  function nextAvatar(): string {
    return AVATARS.find((a) => !profiles.some((p) => p.avatar === a)) ?? AVATARS[profiles.length % AVATARS.length];
  }

  function persistProfiles() {
    saveProfiles($state.snapshot(profiles));
  }

  function submitProfile(event: SubmitEvent) {
    event.preventDefault();
    const name = formName.trim();
    if (!name) return;
    if (editingId) {
      profiles = profiles.map((p) => (p.id === editingId ? { ...p, name, avatar: formAvatar, level: formLevel } : p));
    } else {
      const profile: Profile = { id: newProfileId(), name, avatar: formAvatar, level: formLevel };
      profiles = [...profiles, profile];
      selected = [...selected, profile.id];
    }
    persistProfiles();
    editingId = null;
    formName = '';
    formAvatar = nextAvatar();
  }

  function editProfile(p: Profile) {
    editingId = p.id;
    formName = p.name;
    formAvatar = p.avatar;
    formLevel = p.level;
  }

  function cancelEdit() {
    editingId = null;
    formName = '';
    formAvatar = nextAvatar();
  }

  function removeProfile(p: Profile) {
    if (!confirm(`Smazat hráče ${p.name}?`)) return;
    profiles = profiles.filter((x) => x.id !== p.id);
    selected = selected.filter((id) => id !== p.id);
    teams = teams.map((t) => ({ ...t, memberIds: t.memberIds.filter((id) => id !== p.id) }));
    persistProfiles();
    if (editingId === p.id) cancelEdit();
  }

  function toggleSelected(id: string) {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    if (!selected.includes(id)) teams = teams.map((t) => ({ ...t, memberIds: t.memberIds.filter((m) => m !== id) }));
  }

  function addTeam() {
    const n = teams.length;
    teams = [...teams, { id: `team-${n + 1}`, name: `Tým ${n + 1}`, avatar: TEAM_AVATARS[n % TEAM_AVATARS.length], level: 'hospoda', memberIds: [] }];
  }

  function toggleMember(team: TeamDraft, profileId: string) {
    teams = teams.map((t) => {
      const without = t.memberIds.filter((m) => m !== profileId);
      if (t.id !== team.id) return { ...t, memberIds: without };
      return { ...t, memberIds: t.memberIds.includes(profileId) ? without : [...t.memberIds, profileId] };
    });
  }

  function toggleTheme(theme: Theme) {
    if (themes.includes(theme)) themes = themes.filter((t) => t !== theme);
    else if (themes.length < 6) themes = [...themes, theme];
  }

  function randomThemes() {
    const rand = mulberry32(randomSeed());
    themes = shuffle(THEMES, rand).slice(0, 4);
  }

  function randomSeed(): number {
    try {
      return crypto.getRandomValues(new Uint32Array(1))[0];
    } catch {
      return Math.floor(Math.random() * 2 ** 32);
    }
  }

  const selectedProfiles = $derived(selected.map((id) => profiles.find((p) => p.id === id)).filter((p): p is Profile => !!p));

  const contestants = $derived<Contestant[]>(
    teamsMode
      ? teams
          .filter((t) => t.memberIds.length > 0)
          .map((t) => ({ id: t.id, name: t.name.trim() || 'Tým', avatar: t.avatar, level: t.level, memberIds: t.memberIds.slice() }))
      : selectedProfiles.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, level: p.level, memberIds: [p.id] })),
  );

  const missingLevels = $derived(
    Array.from(new Set(contestants.map((c) => c.level))).filter((level) => counts[level].total === 0),
  );

  const usesPreschoolMix = $derived(
    contestants.some((c) => c.level === 'piskoviste') && themes.some((t) => !PRESCHOOL_THEMES.includes(t)),
  );

  const canStart = $derived(contestants.length > 0 && themes.length > 0 && missingLevels.length === 0);

  function startGame() {
    if (!canStart) return;
    const seen = loadSeen();
    const seenByContestant = Object.fromEntries(
      contestants.map((c) => [c.id, c.memberIds.flatMap((m) => seen[m] ?? [])]),
    );
    const seedParam = Number(page.url.searchParams.get('seed'));
    const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : randomSeed();
    const game = createGame(
      {
        id: `g-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        seed,
        themes: $state.snapshot(themes),
        questionsPerContestant: perContestant,
        timerSeconds: timer,
        contestants: $state.snapshot(contestants),
      },
      questions,
      seenByContestant,
    );
    saveCurrentGame(game);
    rememberTabletNight(game.id, nightId);
    goto('/tablet/hra');
  }

  function discardRunning() {
    if (!confirm('Opravdu zahodit rozehranou hru?')) return;
    clearCurrentGame();
    running = null;
  }

  function winnerOf(h: HistoryEntry): string {
    const top = h.ranking.filter((r) => r.place === 1).map((r) => h.contestants.find((c) => c.id === r.contestantId)?.name ?? '?');
    return top.join(', ');
  }
</script>

<main class="page stack" data-testid="setup">
  <header class="hero">
    <span class="emoji logo" aria-hidden="true">🦉</span>
    <div>
      <h1>Kvízovna</h1>
      <p class="muted">Kvíz u stolu pro celou rodinu — tablet koluje, každý dostane otázku své úrovně.</p>
    </div>
    <a class="btn small ghost home-link" href={nightId ? `/vecery/${nightId}` : '/'} aria-label="Domácí liga">🏡</a>
  </header>
  {#if nightId}
    <p class="note">🌙 Hra se po dohrání zapíše do večera (když je tablet přihlášený k domácnosti).</p>
  {/if}

  {#if running}
    <section class="card running row">
      <div class="grow">
        <strong>Rozehraná hra</strong>
        <span class="muted">— kolo {running.roundIndex + 1} z {running.rounds.length},
          {running.config.contestants.map((c) => c.name).join(', ')}</span>
      </div>
      <a class="btn primary" href="/tablet/hra">▶️ Pokračovat</a>
      <button class="btn ghost" onclick={discardRunning}>Zahodit</button>
    </section>
  {/if}

  <section class="card stack">
    <h2>👪 Hráči</h2>
    {#if profiles.length === 0}
      <p class="muted">Zatím tu nikdo není. Přidej prvního hráče.</p>
    {:else}
      <ul class="profiles">
        {#each profiles as p (p.id)}
          <li class="profile" class:selected={selected.includes(p.id)}>
            <button
              class="profile-main"
              aria-pressed={selected.includes(p.id)}
              aria-label={`${p.name} hraje`}
              onclick={() => toggleSelected(p.id)}
            >
              <span class="emoji avatar">{p.avatar}</span>
              <span class="profile-name">{p.name}</span>
              <span class="badge {p.level}">{LEVEL_EMOJI[p.level]} {LEVEL_LABELS[p.level]}</span>
              <span class="tick" aria-hidden="true">{selected.includes(p.id) ? '✓' : ''}</span>
            </button>
            <div class="profile-tools">
              <button class="btn small ghost" aria-label={`Upravit ${p.name}`} onclick={() => editProfile(p)}>✏️</button>
              <button class="btn small ghost" aria-label={`Smazat ${p.name}`} onclick={() => removeProfile(p)}>🗑️</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    <form class="profile-form stack" onsubmit={submitProfile}>
      <h3>{editingId ? 'Upravit hráče' : 'Nový hráč'}</h3>
      <label class="field">
        <span>Jméno</span>
        <input type="text" bind:value={formName} maxlength="20" autocomplete="off" placeholder="např. Anička" />
      </label>
      <div class="field">
        <span>Úroveň</span>
        <div class="row" role="group" aria-label="Úroveň">
          {#each LEVELS as level (level)}
            <button type="button" class="chip" aria-pressed={formLevel === level} onclick={() => (formLevel = level)}>
              <span class="emoji">{LEVEL_EMOJI[level]}</span>{LEVEL_LABELS[level]}
            </button>
          {/each}
        </div>
        <span class="muted small-note">Hospoda = dospělí · Lavice = 1. stupeň · Pískoviště = předškoláci (předčítá se)</span>
      </div>
      <div class="field">
        <span>Obrázek</span>
        <div class="avatars" role="group" aria-label="Obrázek">
          {#each AVATARS as a (a)}
            <button type="button" class="avatar-pick emoji" aria-pressed={formAvatar === a} aria-label={a} onclick={() => (formAvatar = a)}>{a}</button>
          {/each}
        </div>
      </div>
      <div class="row">
        <button class="btn primary" type="submit" disabled={!formName.trim()}>
          {editingId ? '💾 Uložit' : '➕ Přidat hráče'}
        </button>
        {#if editingId}
          <button class="btn ghost" type="button" onclick={cancelEdit}>Zrušit</button>
        {/if}
      </div>
    </form>
  </section>

  <section class="card stack">
    <div class="row between">
      <h2>🤝 Týmy</h2>
      <button class="chip" aria-pressed={teamsMode} onclick={() => (teamsMode = !teamsMode)}>
        {teamsMode ? 'Hrajeme v týmech' : 'Každý sám za sebe'}
      </button>
    </div>
    {#if teamsMode}
      <p class="muted">Tým odpovídá společně a hraje na jedné úrovni. Klepni na hráče, kterého chceš do týmu.</p>
      {#each teams as team (team.id)}
        <div class="team stack">
          <div class="row">
            <span class="emoji avatar">{team.avatar}</span>
            <input type="text" bind:value={team.name} aria-label="Název týmu" maxlength="20" />
          </div>
          <div class="row" role="group" aria-label="Úroveň týmu">
            {#each LEVELS as level (level)}
              <button type="button" class="chip" aria-pressed={team.level === level} onclick={() => (team.level = level)}>
                <span class="emoji">{LEVEL_EMOJI[level]}</span>{LEVEL_LABELS[level]}
              </button>
            {/each}
          </div>
          <div class="row">
            {#each selectedProfiles as p (p.id)}
              <button type="button" class="chip" aria-pressed={team.memberIds.includes(p.id)} onclick={() => toggleMember(team, p.id)}>
                <span class="emoji">{p.avatar}</span>{p.name}
              </button>
            {/each}
          </div>
        </div>
      {/each}
      <div><button class="btn" onclick={addTeam}>➕ Přidat tým</button></div>
    {/if}
  </section>

  <section class="card stack">
    <div class="row between">
      <h2>🎯 Kola</h2>
      <button class="btn small" onclick={randomThemes}>🎲 Náhodně 4</button>
    </div>
    <p class="muted">Každé kolo je jedno téma. Vyber 1–6 témat, pořadí kol odpovídá pořadí výběru.</p>
    <div class="themes">
      {#each THEMES as theme (theme)}
        {@const index = themes.indexOf(theme)}
        <button class="theme" aria-pressed={index >= 0} onclick={() => toggleTheme(theme)}>
          <span class="emoji theme-emoji">{THEME_EMOJI[theme]}</span>
          <span>{THEME_LABELS[theme]}</span>
          {#if index >= 0}<span class="order" aria-label={`kolo ${index + 1}`}>{index + 1}</span>{/if}
        </button>
      {/each}
    </div>
    {#if usesPreschoolMix}
      <p class="note">🪣 Pro Pískoviště nejsou otázky z Dějin a ze Slov — v těch kolech dostane „Mix Pískoviště“.</p>
    {/if}

    <div class="field">
      <span>Otázek na hráče v kole</span>
      <div class="row" role="group" aria-label="Otázek na hráče v kole">
        {#each [2, 3, 4, 5] as n (n)}
          <button class="chip" aria-pressed={perContestant === n} onclick={() => (perContestant = n)}>{n}</button>
        {/each}
      </div>
    </div>
    <div class="field">
      <span>Časovač</span>
      <div class="row" role="group" aria-label="Časovač">
        {#each [null, 30, 60] as t (t)}
          <button class="chip" aria-pressed={timer === t} onclick={() => (timer = t)}>{t === null ? 'Vypnuto' : `${t} s`}</button>
        {/each}
      </div>
      <span class="muted small-note">U Pískoviště je časovač vždy vypnutý.</span>
    </div>
  </section>

  <section class="start stack">
    {#if missingLevels.length > 0}
      <p class="note warn">
        Pro úroveň {missingLevels.map((l) => LEVEL_LABELS[l]).join(', ')} zatím nejsou žádné ověřené otázky.
      </p>
    {/if}
    {#if questions.length === 0}
      <p class="note warn">Sada otázek je zatím prázdná — nejdřív je potřeba přidat otázky do <code>data/questions</code>.</p>
    {/if}
    <button class="btn primary big" disabled={!canStart} onclick={startGame}>
      ▶️ Začít hru
      {#if contestants.length > 0 && themes.length > 0}
        <span class="start-meta">({contestants.length} × {themes.length} {themes.length === 1 ? 'kolo' : themes.length < 5 ? 'kola' : 'kol'})</span>
      {/if}
    </button>
    <p class="muted center">
      V sadě je {questions.length} otázek{includeDraft ? ' (včetně konceptů)' : ''}:
      {#each LEVELS as level, i (level)}{i > 0 ? ' · ' : ''}{LEVEL_LABELS[level]} {counts[level].total}{/each}
    </p>
  </section>

  <section class="card stack">
    <div class="row between">
      <h2>📜 Odehrané hry</h2>
      <button class="btn small" onclick={downloadHistory} disabled={history.length === 0 && profiles.length === 0}>💾 Stáhnout (JSON)</button>
    </div>
    {#if history.length === 0}
      <p class="muted">Zatím žádná dohraná hra.</p>
    {:else}
      <ul class="history">
        {#each history.slice(-5).reverse() as h (h.id)}
          <li>
            <span>{new Date(h.playedAt).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })}</span>
            <span>🏆 {winnerOf(h)}</span>
            <span class="muted">{h.themes.map((t) => THEME_EMOJI[t]).join(' ')}</span>
          </li>
        {/each}
      </ul>
      <p class="muted">Celkem {gamesLabel(history.length)}.</p>
    {/if}
  </section>
</main>

<style>
  .hero {
    display: flex;
    gap: 18px;
    align-items: center;
    padding: 8px 4px;
  }
  .home-link {
    margin-left: auto;
    align-self: flex-start;
  }
  .hero h1 {
    font-size: 2.6rem;
    margin: 0;
  }
  .hero p {
    margin: 4px 0 0;
  }
  .logo {
    font-size: 4rem;
    background: var(--sage-light);
    border-radius: var(--radius);
    padding: 12px;
  }
  .running {
    background: var(--clay-light);
    border-color: var(--clay);
  }
  .grow {
    flex: 1 1 260px;
  }
  .between {
    justify-content: space-between;
  }
  .between h2 {
    margin: 0;
  }
  .profiles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }
  .profile {
    display: flex;
    align-items: stretch;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: #fff;
    overflow: hidden;
  }
  .profile.selected {
    border-color: var(--sage-dark);
    background: var(--sage-light);
  }
  .profile-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 72px;
    padding: 8px 12px;
    background: none;
    border: none;
    text-align: left;
  }
  .profile-name {
    font-weight: 750;
    font-size: 1.2rem;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tick {
    font-size: 1.5rem;
    color: var(--sage-dark);
    width: 1.2em;
  }
  .profile-tools {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 4px 6px 4px 0;
  }
  .profile-tools .btn {
    min-height: 36px;
    padding: 2px 10px;
  }
  .avatar {
    font-size: 2.4rem;
  }
  .profile-form {
    border-top: 2px dashed var(--line);
    padding-top: 16px;
  }
  .profile-form h3 {
    margin: 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .field > span:first-child {
    font-weight: 700;
  }
  .small-note {
    font-size: 0.9rem;
  }
  .avatars {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .avatar-pick {
    width: 60px;
    height: 60px;
    font-size: 2rem;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: #fff;
  }
  .avatar-pick[aria-pressed='true'] {
    border-color: var(--sage-dark);
    background: var(--sage-light);
  }
  .team {
    border: 2px dashed var(--line);
    border-radius: var(--radius-sm);
    padding: 14px;
  }
  .team input {
    flex: 1;
    width: auto;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
  }
  .theme {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 74px;
    padding: 10px 16px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: #fff;
    font-weight: 700;
    font-size: 1.05rem;
    text-align: left;
  }
  .theme[aria-pressed='true'] {
    border-color: var(--slate-dark);
    background: var(--slate-light);
  }
  .theme-emoji {
    font-size: 2rem;
  }
  .order {
    position: absolute;
    top: -10px;
    right: -8px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--slate-dark);
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 1rem;
  }
  .note {
    margin: 0;
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    background: var(--sage-light);
  }
  .note.warn {
    background: var(--bad-bg);
    color: var(--bad);
  }
  .start {
    align-items: center;
    padding: 8px 0;
  }
  .start .btn {
    min-width: min(100%, 420px);
  }
  .start-meta {
    font-weight: 500;
    font-size: 1rem;
    opacity: 0.85;
  }
  .center {
    text-align: center;
    margin: 0;
  }
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .history li {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  @media (max-width: 600px) {
    .hero h1 {
      font-size: 2rem;
    }
    .logo {
      font-size: 3rem;
    }
  }
</style>
