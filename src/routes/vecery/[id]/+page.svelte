<script lang="ts">
  import { page } from '$app/state';
  import { api, ApiError, formatDate, formatDateTime, GAME_EMOJI, GAME_LABELS, placeMedal } from '#lib/ui/app/api.ts';
  import Guard from '#lib/ui/app/Guard.svelte';
  import LeagueTable from '#lib/ui/app/LeagueTable.svelte';
  import NewCardMatch from '#lib/ui/app/NewCardMatch.svelte';
  import { session } from '#lib/ui/app/session.svelte.ts';

  import type { GameType } from '#lib/league/types.ts';
  interface Detail {
    night: { id: number; played_on: string; title: string | null; status: 'open' | 'closed'; season_id: number | null; season_name: string | null };
    matches: {
      id: number;
      game_type: GameType;
      mode: string | null;
      status: string;
      room_code: string | null;
      finished_at: string | null;
      created_at: string;
      participants: { player_id: number | null; team_id: number | null; name: string; avatar: string; place: number | null; score: number; league_points: number }[];
    }[];
    standings: { playerId: string; points: number; matches: number; wins: number; average: number; place: number; lastNightPoints: number }[];
    best: { playerId: string; points: number }[];
    names: Record<string, string>;
  }

  let detail = $state<Detail | null>(null);
  let adding = $state<'prsi' | 'zoliky' | null>(null);
  let message = $state<string | null>(null);

  $effect(() => {
    const id = page.params.id;
    if (session.household && id) load(id);
  });

  async function load(id: string) {
    try {
      detail = await api<Detail>(`/api/nights/${id}`);
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Večer se nepodařilo načíst.';
    }
  }

  async function setStatus(status: 'open' | 'closed') {
    if (!detail) return;
    try {
      await api(`/api/nights/${detail.night.id}`, { method: 'PATCH', body: { status } });
      await load(String(detail.night.id));
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Nepovedlo se.';
    }
  }

  async function dropMatch(id: number) {
    if (!detail || !confirm('Zrušit rozepsanou partii? Zápis se zahodí.')) return;
    try {
      await api(`/api/matches/${id}`, { method: 'DELETE' });
      await load(String(detail.night.id));
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Nepovedlo se.';
    }
  }

  function continueHref(m: Detail['matches'][number]): string | null {
    if (m.game_type === 'prsi' || m.game_type === 'zoliky') return `/karty/${m.game_type}/${m.id}`;
    if (m.room_code) return `/tv/${m.room_code}`;
    return null;
  }
</script>

<main class="page stack">
  <Guard>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}
    {#if detail}
      {@const n = detail.night}
      {@const open = n.status === 'open'}
      <header class="row between">
        <div>
          <h1 class="section-title">🌙 {n.title ?? `Večer ${formatDate(n.played_on)}`}</h1>
          <p class="muted sub">{formatDate(n.played_on)} · {n.season_name ? `sezóna ${n.season_name}` : 'bez sezóny'}{open ? '' : ' · uzavřený'}</p>
        </div>
        {#if open}
          <button class="btn small ghost" onclick={() => setStatus('closed')}>Uzavřít večer</button>
        {:else}
          <button class="btn small ghost" onclick={() => setStatus('open')}>Znovu otevřít</button>
        {/if}
      </header>

      {#if detail.best.length && detail.matches.some((m) => m.status === 'finished')}
        <section class="card best row" data-testid="best-player">
          <span class="emoji crown">👑</span>
          <span class="grow">
            <span class="muted">Hráč večera</span><br />
            <strong>{detail.best.map((b) => detail!.names[b.playerId]).join(', ')}</strong>
            <span class="muted"> · {detail.best[0].points} bodů</span>
          </span>
        </section>
      {/if}

      {#if open}
        <section class="card stack">
          <h2 class="section-title">➕ Další partie</h2>
          <div class="adds">
            <a class="tile" href={`/tv?night=${n.id}`}><span class="emoji">📺</span>Kvíz na TV</a>
            <a class="tile" href={`/tablet?night=${n.id}`}><span class="emoji">🦉</span>Kvíz na tabletu</a>
            <a class="tile" href={`/tv?night=${n.id}&hra=aktivity`}><span class="emoji">🎭</span>Řekni, ukaž, nakresli</a>
            <a class="tile" href={`/tv?night=${n.id}&hra=mjz`}><span class="emoji">✍️</span>Město, jméno, zvíře</a>
            <button class="tile" aria-pressed={adding === 'prsi'} onclick={() => (adding = adding === 'prsi' ? null : 'prsi')}><span class="emoji">🃏</span>Prší</button>
            <button class="tile" aria-pressed={adding === 'zoliky'} onclick={() => (adding = adding === 'zoliky' ? null : 'zoliky')}><span class="emoji">🂡</span>Žolíky</button>
          </div>
        </section>
        {#if adding}
          {#key adding}
            <NewCardMatch gameType={adding} nightId={n.id} oncancel={() => (adding = null)} />
          {/key}
        {/if}
      {/if}

      <section class="card stack">
        <h2 class="section-title">🏆 Tabulka večera</h2>
        <LeagueTable rows={detail.standings} names={detail.names} testid="night-table" empty="Zatím žádná dohraná partie." />
      </section>

      <section class="card stack">
        <h2 class="section-title">🎲 Partie</h2>
        {#if detail.matches.length === 0}
          <p class="empty">Zatím žádná partie.</p>
        {:else}
          <ol class="matches" data-testid="night-matches">
            {#each detail.matches as m, i (m.id)}
              {@const href = continueHref(m)}
              <li class="match">
                <div class="row between">
                  <strong>{i + 1}. {GAME_EMOJI[m.game_type]} {GAME_LABELS[m.game_type]}{m.game_type === 'quiz' && m.mode ? (m.mode === 'live' ? ' (TV)' : ' (tablet)') : ''}</strong>
                  {#if m.status === 'finished'}
                    <span class="muted">{formatDateTime(m.finished_at)}</span>
                  {:else}
                    <span class="row">
                      {#if href}<a class="btn small primary" href={href}>Pokračovat</a>{/if}
                      {#if m.game_type === 'prsi' || m.game_type === 'zoliky'}<button class="btn small ghost" onclick={() => dropMatch(m.id)}>Zrušit</button>{/if}
                    </span>
                  {/if}
                </div>
                {#if m.status === 'finished'}
                  <ul class="parts">
                    {#each m.participants as p, j (j)}
                      <li>{placeMedal(p.place)} <span class="emoji">{p.avatar}</span> {p.name} <span class="muted">· {p.league_points} b.</span></li>
                    {/each}
                  </ul>
                {:else}
                  <p class="muted">rozehraná</p>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}
      </section>
    {/if}
  </Guard>
</main>

<style>
  .sub {
    margin: 4px 0 0;
  }
  .best {
    background: var(--clay-light);
    border-color: var(--clay);
  }
  .crown {
    font-size: 2.6rem;
  }
  .adds {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-height: 96px;
    padding: 14px 18px;
    border: 2px solid var(--line);
    border-radius: var(--radius);
    background: #fff;
    color: var(--ink);
    text-decoration: none;
    font-weight: 800;
    font-size: 1.15rem;
    text-align: left;
  }
  .tile[aria-pressed='true'] {
    border-color: var(--sage-dark);
    background: var(--sage-light);
  }
  .tile .emoji {
    font-size: 2rem;
  }
  .matches {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .match {
    padding: 12px 14px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: #fff;
  }
  .match p {
    margin: 6px 0 0;
  }
  .parts {
    list-style: none;
    padding: 0;
    margin: 8px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
  }
</style>
