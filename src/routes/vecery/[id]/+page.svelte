<script lang="ts">
  import { page } from '$app/state';
  import { api, ApiError, formatDate, formatDateTime, GAME_EMOJI, GAME_LABELS } from '#lib/ui/app/api.ts';
  import Medal from '#lib/ui/app/Medal.svelte';
  import Art from '#lib/ui/art/Art.svelte';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import GameCard from '#lib/ui/art/GameCard.svelte';
  import { GAME_ART, GAME_NAMES } from '#lib/ui/art/art.ts';
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

<svelte:head><title>{detail?.night.title ?? 'Večer'} · Herní večer</title></svelte:head>

<main class="page stack">
  <Guard>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}
    {#if detail}
      {@const n = detail.night}
      {@const open = n.status === 'open'}
      <header class="row between">
        <div>
          <h1 class="section-title">{n.title ?? `Večer ${formatDate(n.played_on)}`}</h1>
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
          <Art name="rewards.vitez-vecera" size={72} decorative class="crown" />
          <span class="grow">
            <span class="muted">{open ? 'Zatím vede' : 'Vítěz večera'}</span><br />
            <strong>{detail.best.map((b) => detail!.names[b.playerId]).join(', ')}</strong>
            <span class="muted"> · {detail.best[0].points} bodů</span>
          </span>
        </section>
      {/if}

      {#if open}
        <section class="card stack">
          <h2 class="section-title">Další partie</h2>
          <p class="muted hint">Na televizi a telefonech:</p>
          <div class="adds">
            <GameCard small art={GAME_ART.kvizovna} title={GAME_NAMES.kvizovna} href={`/tv?night=${n.id}&hra=quiz`} testid="add-quiz-tv" />
            <GameCard small art={GAME_ART.aktivity} title={GAME_NAMES.aktivity} href={`/tv?night=${n.id}&hra=aktivity`} />
            <GameCard small art={GAME_ART.mjz} title={GAME_NAMES.mjz} href={`/tv?night=${n.id}&hra=mjz`} />
            <GameCard small art={GAME_ART.sachy} title={GAME_NAMES.sachy} href={`/tv?night=${n.id}&hra=chess`} />
            <GameCard small art={GAME_ART.prsi} title={GAME_NAMES.prsi} href={`/tv?night=${n.id}&hra=prsi-hra`} />
            <GameCard small art={GAME_ART.zoliky} title={GAME_NAMES.zoliky} href={`/tv?night=${n.id}&hra=zoliky-hra`} />
          </div>
          <p class="muted hint">Bez televize:</p>
          <div class="row">
            <a class="btn" href={`/tablet?night=${n.id}`}>🦉 Kvízovna na tabletu</a>
            <button class="btn" aria-pressed={adding === 'prsi'} onclick={() => (adding = adding === 'prsi' ? null : 'prsi')}>🃏 Zápis karet: Prší</button>
            <button class="btn" aria-pressed={adding === 'zoliky'} onclick={() => (adding = adding === 'zoliky' ? null : 'zoliky')}>🂡 Zápis karet: Žolíky</button>
          </div>
        </section>
        {#if adding}
          {#key adding}
            <NewCardMatch gameType={adding} nightId={n.id} oncancel={() => (adding = null)} />
          {/key}
        {/if}
      {/if}

      <section class="card stack">
        <h2 class="section-title">Tabulka večera</h2>
        <LeagueTable rows={detail.standings} names={detail.names} testid="night-table" empty="Zatím žádná dohraná partie." />
      </section>

      <section class="card stack">
        <h2 class="section-title">Partie</h2>
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
                      <li><Medal place={p.place} size={26} /> <Avatar value={p.avatar} /> {p.name} <span class="muted">· {p.league_points} b.</span></li>
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
  .best :global(.crown) {
    width: 72px;
    height: 72px;
  }
  .hint {
    margin: 0;
    font-weight: 650;
  }
  .adds {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
  }
  .btn[aria-pressed='true'] {
    border-color: var(--sage-dark);
    background: var(--sage-light);
  }
  @media (max-width: 420px) {
    .adds {
      grid-template-columns: 1fr 1fr;
    }
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
    background: var(--surface);
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
