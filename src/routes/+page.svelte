<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { exportData, loadHistory, loadProfiles } from '#lib/storage.ts';
  import { api, ApiError, formatDate } from '#lib/ui/app/api.ts';
  import { loadSession, session } from '#lib/ui/app/session.svelte.ts';

  interface NightRow {
    id: number;
    played_on: string;
    title: string | null;
    matches: number;
  }

  let name = $state('');
  let pin = $state('');
  let pin2 = $state('');
  let householdName = $state('');
  let showName = $state(false);
  let busy = $state(false);
  let message = $state<string | null>(null);

  let today = $state<NightRow | null>(null);
  let importInfo = $state<string | null>(null);
  let localGames = $state(0);
  let localProfiles = $state(0);

  onMount(async () => {
    await loadSession();
    localGames = loadHistory().length;
    localProfiles = loadProfiles().length;
    if (session.household) loadToday();
  });

  async function loadToday() {
    try {
      today = (await api<{ today: NightRow | null }>('/api/nights')).today;
    } catch {
      today = null;
    }
  }

  async function run(fn: () => Promise<void>) {
    busy = true;
    message = null;
    try {
      await fn();
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Něco se nepovedlo.';
    } finally {
      busy = false;
    }
  }

  function createHousehold(event: SubmitEvent) {
    event.preventDefault();
    if (pin !== pin2) {
      message = 'PINy se neshodují.';
      return;
    }
    run(async () => {
      await api('/api/household', { body: { name, pin } });
      await loadSession();
      loadToday();
    });
  }

  function login(event: SubmitEvent) {
    event.preventDefault();
    run(async () => {
      await api('/api/login', { body: { pin, name: showName ? householdName : undefined } });
      pin = '';
      await loadSession();
      loadToday();
    });
  }

  function logout() {
    run(async () => {
      await api('/api/logout', { body: {} });
      await loadSession();
    });
  }

  function newNight() {
    run(async () => {
      const { night } = await api<{ night: { id: number } }>('/api/nights', { body: {} });
      goto(`/vecery/${night.id}`);
    });
  }

  function cardsHref(game: 'prsi' | 'zoliky'): string {
    return `/karty/nova?hra=${game}${today ? `&night=${today.id}` : ''}`;
  }

  async function sendImport(data: unknown) {
    const { result } = await api<{ result: Record<string, number> }>('/api/import/tablet', { body: data });
    importInfo = `Hotovo: ${result.players_created} nových hráčů, ${result.matches_created} her přeneseno, ${result.matches_skipped} už bylo na serveru.`;
  }

  function importFromDevice() {
    run(() => sendImport(exportData()));
  }

  function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    run(async () => {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new ApiError('Soubor není platný JSON z exportu tabletu.', 400, null);
      }
      await sendImport(data);
      input.value = '';
    });
  }
</script>

<main class="page stack home">
  <header class="hero">
    <span class="emoji logo" aria-hidden="true">🏡</span>
    <div>
      <h1>Domácí liga</h1>
      <p class="muted">Kvízy, řekni-ukaž-nakresli, město-jméno-zvíře, prší a žolíky — večery, tabulka sezóny a statistiky celé rodiny.</p>
    </div>
  </header>

  {#if !session.loaded}
    <p class="muted">Načítám…</p>
  {:else if session.offline}
    <section class="card stack">
      <h2>Server není dostupný</h2>
      <p class="muted">Ligu, večery a karty teď uložit nejde. Kvíz na jednom tabletu funguje i bez serveru.</p>
      <div class="row">
        <a class="btn primary big" href="/tablet">🦉 Kvíz na jednom tabletu</a>
        <button class="btn ghost" onclick={() => loadSession()}>Zkusit znovu</button>
      </div>
    </section>
  {:else if !session.household && session.setupRequired}
    <form class="card stack narrow" onsubmit={createHousehold} data-testid="setup-household">
      <h2>Založit domácnost</h2>
      <p class="muted">Jednou na začátku. PIN pak zadáš na každém novém zařízení.</p>
      <label class="field"><span>Název domácnosti</span><input type="text" bind:value={name} maxlength="60" placeholder="např. Novákovi" /></label>
      <label class="field"><span>PIN (4–8 číslic)</span><input type="password" inputmode="numeric" bind:value={pin} maxlength="8" autocomplete="new-password" /></label>
      <label class="field"><span>PIN znovu</span><input type="password" inputmode="numeric" bind:value={pin2} maxlength="8" autocomplete="new-password" /></label>
      {#if message}<p class="note warn" role="alert">{message}</p>{/if}
      <button class="btn primary big" type="submit" disabled={busy || !name.trim() || pin.length < 4}>Založit domácnost</button>
    </form>
  {:else if !session.household}
    <form class="card stack narrow" onsubmit={login} data-testid="login">
      <h2>Přihlášení</h2>
      <label class="field"><span>PIN domácnosti</span><input type="password" inputmode="numeric" bind:value={pin} maxlength="8" autocomplete="current-password" /></label>
      {#if showName}
        <label class="field"><span>Název domácnosti</span><input type="text" bind:value={householdName} maxlength="60" /></label>
      {:else}
        <button type="button" class="btn small ghost" onclick={() => (showName = true)}>Jiná domácnost…</button>
      {/if}
      {#if message}<p class="note warn" role="alert">{message}</p>{/if}
      <button class="btn primary big" type="submit" disabled={busy || pin.length < 4}>Přihlásit</button>
      <a class="btn ghost" href="/tablet">🦉 Kvíz na tabletu bez přihlášení</a>
    </form>
  {:else}
    {#if today}
      <a class="card today row" href={`/vecery/${today.id}`}>
        <span class="emoji big-emoji">🌙</span>
        <span class="grow"><strong>Dnešní večer</strong><br /><span class="muted">{today.title ?? formatDate(today.played_on)} · partií: {today.matches}</span></span>
        <span class="btn primary">Pokračovat</span>
      </a>
    {/if}
    <section class="tiles" aria-label="Rozcestník">
      <button class="tile primary-tile" onclick={newNight} disabled={busy}><span class="emoji">🌙</span>Nový večer</button>
      <a class="tile" href={today ? `/tv?night=${today.id}` : '/tv'}><span class="emoji">📺</span>Kvíz na TV a mobilech</a>
      <a class="tile" href={today ? `/tablet?night=${today.id}` : '/tablet'}><span class="emoji">🦉</span>Kvíz na jednom tabletu</a>
      <a class="tile" href={today ? `/tv?night=${today.id}&hra=aktivity` : '/tv?hra=aktivity'}><span class="emoji">🎭</span>Řekni, ukaž, nakresli</a>
      <a class="tile" href={today ? `/tv?night=${today.id}&hra=mjz` : '/tv?hra=mjz'}><span class="emoji">✍️</span>Město, jméno, zvíře</a>
      <a class="tile" href={cardsHref('prsi')}><span class="emoji">🃏</span>Prší</a>
      <a class="tile" href={cardsHref('zoliky')}><span class="emoji">🂡</span>Žolíky</a>
      <a class="tile" href="/liga"><span class="emoji">🏆</span>Liga</a>
      <a class="tile" href="/hraci"><span class="emoji">👪</span>Hráči</a>
      <a class="tile" href="/vecery"><span class="emoji">📅</span>Večery</a>
    </section>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}

    <section class="card stack">
      <h2>📲 Import z tabletu</h2>
      <p class="muted">Přenese profily, odehrané kvízy a viděné otázky z tabletové verze. Opakovaný import nic nezdvojí.</p>
      <div class="row">
        <button class="btn" onclick={importFromDevice} disabled={busy || (localGames === 0 && localProfiles === 0)}>
          Z tohoto zařízení ({localProfiles} hráčů, {localGames} her)
        </button>
        <label class="btn ghost file">
          Ze souboru (JSON)
          <input type="file" accept="application/json,.json" onchange={importFile} class="visually-hidden" />
        </label>
      </div>
      {#if importInfo}<p class="note" role="status">{importInfo}</p>{/if}
    </section>

    <div class="row end">
      <button class="btn small ghost" onclick={logout}>Odhlásit {session.household.name}</button>
    </div>
  {/if}
</main>

<style>
  .hero {
    display: flex;
    gap: 18px;
    align-items: center;
    padding: 8px 4px;
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
  .narrow {
    max-width: 560px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-weight: 700;
  }
  input[type='password'] {
    font: inherit;
    font-size: 1.6rem;
    letter-spacing: 0.3em;
    min-height: 60px;
    padding: 10px 16px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: #fff;
    width: 100%;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 8px;
    min-height: 130px;
    padding: 18px 20px;
    border: 2px solid var(--line);
    border-radius: var(--radius);
    background: var(--paper);
    box-shadow: var(--shadow);
    color: var(--ink);
    text-decoration: none;
    font-size: 1.25rem;
    font-weight: 800;
    text-align: left;
  }
  .tile .emoji {
    font-size: 2.6rem;
  }
  .tile:active {
    transform: translateY(2px);
  }
  .primary-tile {
    background: var(--sage-dark);
    border-color: #3f4b37;
    color: #fbf8f1;
  }
  .today {
    text-decoration: none;
    color: inherit;
    background: var(--clay-light);
    border-color: var(--clay);
  }
  .big-emoji {
    font-size: 2.4rem;
  }
  .grow {
    flex: 1 1 200px;
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
  .file {
    position: relative;
  }
  .end {
    justify-content: flex-end;
  }
</style>
