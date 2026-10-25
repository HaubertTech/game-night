<script lang="ts">
  import { LEVELS, LEVEL_LABELS, type Level } from '#lib/types.ts';
  import { AVATARS, TEAM_AVATARS } from '#lib/ui/labels.ts';
  import ArtIcon from '#lib/ui/live/ArtIcon.svelte';
  import Art from '#lib/ui/art/Art.svelte';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import { ART_AVATARS, LEVEL_ART, avatarName, freeArtAvatar } from '#lib/ui/art/art.ts';
  import { api, ApiError } from '#lib/ui/app/api.ts';
  import Guard from '#lib/ui/app/Guard.svelte';
  import { session } from '#lib/ui/app/session.svelte.ts';

  interface Player {
    id: number;
    name: string;
    avatar: string;
    level: Level;
    birth_year: number | null;
    archived_at: string | null;
  }
  interface Team {
    id: number;
    name: string;
    avatar: string;
    member_ids: number[];
  }

  let players = $state<Player[]>([]);
  let teams = $state<Team[]>([]);
  let showArchived = $state(false);
  let message = $state<string | null>(null);
  let busy = $state(false);

  let editingId = $state<number | null>(null);
  let formName = $state('');
  let formAvatar = $state(ART_AVATARS[0]);
  let formLevel = $state<Level>('hospoda');
  let formYear = $state('');

  let teamName = $state('');
  let teamMembers = $state<number[]>([]);

  const active = $derived(players.filter((p) => !p.archived_at));
  const archived = $derived(players.filter((p) => p.archived_at));
  const nameOf = (id: number) => players.find((p) => p.id === id)?.name ?? '?';

  $effect(() => {
    if (session.household) load();
  });

  async function load() {
    try {
      const [p, t] = await Promise.all([api<{ players: Player[] }>('/api/players?archived=1'), api<{ teams: Team[] }>('/api/teams')]);
      players = p.players;
      teams = t.teams;
      if (!editingId && !formName) formAvatar = freeArtAvatar(players.filter((p) => !p.archived_at).map((p) => p.avatar));
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Nepodařilo se načíst hráče.';
    }
  }

  async function run(fn: () => Promise<void>) {
    busy = true;
    message = null;
    try {
      await fn();
      await load();
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Něco se nepovedlo. Zkus to znovu.';
    } finally {
      busy = false;
    }
  }

  function resetForm() {
    editingId = null;
    formName = '';
    formYear = '';
    formLevel = 'hospoda';
    formAvatar = freeArtAvatar(players.filter((p) => !p.archived_at).map((p) => p.avatar));
  }

  function edit(p: Player) {
    editingId = p.id;
    formName = p.name;
    formAvatar = p.avatar;
    formLevel = p.level;
    formYear = p.birth_year ? String(p.birth_year) : '';
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const body = { name: formName, avatar: formAvatar, level: formLevel, birth_year: formYear.trim() ? Number(formYear) : null };
    run(async () => {
      if (editingId) await api(`/api/players/${editingId}`, { method: 'PATCH', body });
      else await api('/api/players', { body });
      resetForm();
    });
  }

  function archive(p: Player) {
    if (!confirm(`Archivovat hráče ${p.name}? Odehrané partie a statistiky zůstanou.`)) return;
    run(async () => {
      await api(`/api/players/${p.id}`, { method: 'DELETE' });
      if (editingId === p.id) resetForm();
    });
  }

  function erase(p: Player) {
    if (!confirm(`Smazat hráče ${p.name}? Jeho jméno, rok narození a viděné otázky zmizí. Ve výsledcích zůstane jako „Smazaný hráč“. Nejde to vrátit.`)) return;
    run(async () => {
      await api(`/api/players/${p.id}/erase`, { method: 'POST', body: {} });
      if (editingId === p.id) resetForm();
    });
  }

  function toggleMember(id: number) {
    teamMembers = teamMembers.includes(id) ? teamMembers.filter((m) => m !== id) : [...teamMembers, id];
  }

  function createTeam(event: SubmitEvent) {
    event.preventDefault();
    run(async () => {
      await api('/api/teams', { body: { name: teamName, avatar: TEAM_AVATARS[teams.length % TEAM_AVATARS.length], member_ids: teamMembers } });
      teamName = '';
      teamMembers = [];
    });
  }

  function archiveTeam(t: Team) {
    if (!confirm(`Archivovat tým ${t.name}?`)) return;
    run(async () => {
      await api(`/api/teams/${t.id}`, { method: 'DELETE' });
    });
  }
</script>

<svelte:head><title>Hráči · Herní večer</title></svelte:head>

<main class="page stack">
  <h1>Hráči</h1>
  <Guard>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}

    <section class="card stack">
      {#if active.length === 0}
        <div class="empty-state">
          <Art name="empty.zadni-hraci" size={140} />
          <p class="muted">Zatím tu nikdo není. Přidej prvního hráče, nebo na úvodní stránce přenes profily z tabletu.</p>
        </div>
      {:else}
        <ul class="players" data-testid="players">
          {#each active as p (p.id)}
            <li class="player">
              <a class="player-main" href={`/hrac/${p.id}`}>
                <span class="avatar"><Avatar value={p.avatar} px={56} /></span>
                <span class="grow">
                  <span class="name">{p.name}</span>
                  <span class="meta">
                    <span class="badge {p.level}"><ArtIcon name={LEVEL_ART[p.level]} /> {LEVEL_LABELS[p.level]}</span>
                    {#if p.birth_year}<span class="muted">nar. {p.birth_year}</span>{/if}
                  </span>
                </span>
              </a>
              <div class="tools">
                <button class="btn small ghost" aria-label={`Upravit ${p.name}`} onclick={() => edit(p)}>✏️</button>
                <button class="btn small ghost" aria-label={`Archivovat ${p.name}`} onclick={() => archive(p)}>📦</button>
                {#if session.role === 'manager'}
                  <button class="btn small ghost" aria-label={`Smazat ${p.name}`} onclick={() => erase(p)}>🗑️</button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      <form class="stack form" onsubmit={submit}>
        <h2>{editingId ? 'Upravit hráče' : 'Nový hráč'}</h2>
        <div class="grid2">
          <label class="field"><span>Jméno</span><input type="text" bind:value={formName} maxlength="40" autocomplete="off" /></label>
          <label class="field"><span>Rok narození</span><input type="text" inputmode="numeric" bind:value={formYear} maxlength="4" placeholder="nepovinné" /></label>
        </div>
        <p class="muted privacy" data-testid="child-name-hint">U dětí stačí přezdívka. Rok narození je nepovinný — slouží jen k výběru otázek. Fotky ani jiné údaje o dětech aplikace neukládá.</p>
        <div class="field">
          <span>Úroveň</span>
          <div class="row" role="group" aria-label="Úroveň">
            {#each LEVELS as level (level)}
              <button type="button" class="chip" aria-pressed={formLevel === level} onclick={() => (formLevel = level)}>
                <ArtIcon name={LEVEL_ART[level]} /> {LEVEL_LABELS[level]}
              </button>
            {/each}
          </div>
        </div>
        <div class="field">
          <span>Obrázek</span>
          <div class="avatars" role="group" aria-label="Obrázek">
            {#each ART_AVATARS as a (a)}
              <button type="button" class="avatar-pick art" aria-pressed={formAvatar === a} aria-label={avatarName(a)} onclick={() => (formAvatar = a)}>
                <Avatar value={a} px={56} />
              </button>
            {/each}
          </div>
          <details class="emoji-pick" open={!formAvatar.startsWith('art:')}>
            <summary>Nebo emoji</summary>
            <div class="avatars" role="group" aria-label="Emoji">
              {#each AVATARS as a (a)}
                <button type="button" class="avatar-pick emoji" aria-pressed={formAvatar === a} aria-label={a} onclick={() => (formAvatar = a)}>{a}</button>
              {/each}
            </div>
          </details>
        </div>
        <div class="row">
          <button class="btn primary" type="submit" disabled={busy || !formName.trim()}>{editingId ? 'Uložit' : '➕ Přidat hráče'}</button>
          {#if editingId}<button class="btn ghost" type="button" onclick={resetForm}>Zrušit</button>{/if}
        </div>
      </form>
    </section>

    <section class="card stack">
      <h2>Týmy</h2>
      {#if teams.length === 0}
        <p class="muted">Zatím žádný tým. Tým hraje kvíz společně a ligové body dostane každý člen.</p>
      {:else}
        <ul class="teams">
          {#each teams as t (t.id)}
            <li class="row">
              <span class="emoji avatar">{t.avatar}</span>
              <span class="grow"><strong>{t.name}</strong> <span class="muted">— {t.member_ids.map(nameOf).join(', ')}</span></span>
              <button class="btn small ghost" aria-label={`Archivovat tým ${t.name}`} onclick={() => archiveTeam(t)}>📦</button>
            </li>
          {/each}
        </ul>
      {/if}
      <form class="stack" onsubmit={createTeam}>
        <label class="field"><span>Název týmu</span><input type="text" bind:value={teamName} maxlength="40" /></label>
        <div class="row" role="group" aria-label="Členové týmu">
          {#each active as p (p.id)}
            <button type="button" class="chip" aria-pressed={teamMembers.includes(p.id)} onclick={() => toggleMember(p.id)}>
              <Avatar value={p.avatar} />{p.name}
            </button>
          {/each}
        </div>
        <div><button class="btn" type="submit" disabled={busy || !teamName.trim() || teamMembers.length < 2}>➕ Založit tým</button></div>
      </form>
    </section>

    {#if archived.length}
      <section class="card stack">
        <button class="btn small ghost" onclick={() => (showArchived = !showArchived)}>
          {showArchived ? 'Skrýt' : 'Ukázat'} archivované ({archived.length})
        </button>
        {#if showArchived}
          <ul class="teams">
            {#each archived as p (p.id)}
              <li class="row">
                <Avatar value={p.avatar} /><a class="grow" href={`/hrac/${p.id}`}>{p.name}</a>
                {#if session.role === 'manager' && p.name !== 'Smazaný hráč'}
                  <button class="btn small ghost" aria-label={`Smazat ${p.name}`} onclick={() => erase(p)}>🗑️</button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </Guard>
</main>

<style>
  .privacy {
    margin: 0;
    font-size: 0.95rem;
  }
  h1 {
    margin: 8px 0 0;
  }
  .players {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }
  .player {
    display: flex;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .player-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 76px;
    padding: 8px 12px;
    color: inherit;
    text-decoration: none;
  }
  .name {
    display: block;
    font-weight: 800;
    font-size: 1.2rem;
  }
  .meta {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 0.9rem;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .tools {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 4px;
  }
  .tools .btn {
    min-height: 44px;
    min-width: 44px;
  }
  .avatar {
    font-size: 2.4rem;
  }
  .emoji-pick summary {
    cursor: pointer;
    font-weight: 650;
    color: var(--ink-soft);
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  .form {
    border-top: 2px dashed var(--line);
    padding-top: 16px;
  }
  .form h2 {
    margin: 0;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-weight: 700;
  }
  .avatars {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .avatar-pick {
    width: 56px;
    height: 56px;
    font-size: 1.9rem;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }
  .avatar-pick.art {
    width: 72px;
    height: 72px;
    padding: 4px;
    font-size: 2.6rem;
  }
  .avatar-pick[aria-pressed='true'] {
    border-color: var(--sage-dark);
    background: var(--sage-light);
  }
  .teams {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .note {
    margin: 0;
    padding: 12px 16px;
    border-radius: var(--radius-sm);
  }
  .note.warn {
    background: var(--bad-bg);
    color: var(--bad);
  }
  @media (max-width: 600px) {
    .grid2 {
      grid-template-columns: 1fr;
    }
  }
</style>
