<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError, formatDate } from '#lib/ui/app/api.ts';
  import Guard from '#lib/ui/app/Guard.svelte';
  import { session } from '#lib/ui/app/session.svelte.ts';

  interface Night {
    id: number;
    played_on: string;
    title: string | null;
    status: 'open' | 'closed';
    season_name: string | null;
    matches: number;
  }
  interface Season {
    id: number;
    name: string;
    starts_on: string;
    ends_on: string;
  }

  let nights = $state<Night[]>([]);
  let seasons = $state<Season[]>([]);
  let message = $state<string | null>(null);
  let busy = $state(false);

  let playedOn = $state(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date()));
  let title = $state('');
  /** 'auto' = season covering the date, 'none' = no season, otherwise season id. */
  let seasonChoice = $state<string>('auto');

  $effect(() => {
    if (session.household) load();
  });

  async function load() {
    try {
      const [n, s] = await Promise.all([api<{ nights: Night[] }>('/api/nights'), api<{ seasons: Season[] }>('/api/seasons')]);
      nights = n.nights;
      seasons = s.seasons;
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Večery se nepodařilo načíst.';
    }
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    message = null;
    try {
      const body: Record<string, unknown> = { played_on: playedOn, title };
      if (seasonChoice === 'none') body.season_id = null;
      else if (seasonChoice !== 'auto') body.season_id = Number(seasonChoice);
      const { night } = await api<{ night: Night }>('/api/nights', { body });
      goto(`/vecery/${night.id}`);
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Večer se nepodařilo založit.';
      busy = false;
    }
  }
</script>

<main class="page stack">
  <h1 class="section-title">🌙 Večery</h1>
  <Guard>
    <form class="card stack" onsubmit={create} data-testid="new-night">
      <h2 class="section-title">Nový večer</h2>
      <div class="row">
        <label class="field"><span>Datum</span><input type="date" bind:value={playedOn} /></label>
        <label class="field grow"><span>Název (nepovinné)</span><input type="text" bind:value={title} maxlength="80" placeholder="např. Babička na návštěvě" /></label>
      </div>
      <label class="field">
        <span>Sezóna</span>
        <select bind:value={seasonChoice} class="select">
          <option value="auto">Podle data</option>
          {#each seasons as s (s.id)}<option value={String(s.id)}>{s.name} ({formatDate(s.starts_on)} – {formatDate(s.ends_on)})</option>{/each}
          <option value="none">Bez sezóny</option>
        </select>
      </label>
      {#if message}<p class="note warn" role="alert">{message}</p>{/if}
      <div><button class="btn primary big" type="submit" disabled={busy}>🌙 Založit večer</button></div>
    </form>

    <section class="card stack">
      <h2 class="section-title">Odehrané večery</h2>
      {#if nights.length === 0}
        <p class="empty">Zatím žádný večer.</p>
      {:else}
        <ul class="nights">
          {#each nights as n (n.id)}
            <li>
              <a href={`/vecery/${n.id}`} class="night row">
                <span class="emoji">{n.status === 'open' ? '🌙' : '✅'}</span>
                <span class="grow"><strong>{n.title ?? formatDate(n.played_on)}</strong>
                  <span class="muted">{n.title ? formatDate(n.played_on) + ' · ' : ''}{n.season_name ?? 'bez sezóny'}</span></span>
                <span class="muted">partií: {n.matches}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </Guard>
</main>

<style>
  .select {
    font: inherit;
    font-size: 1.15rem;
    min-height: 56px;
    padding: 8px 12px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: #fff;
  }
  .nights {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .night {
    min-height: 64px;
    padding: 8px 12px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: #fff;
    color: inherit;
    text-decoration: none;
  }
  .night .emoji {
    font-size: 1.8rem;
  }
  .night .muted {
    display: block;
    font-size: 0.95rem;
  }
</style>
