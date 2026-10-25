<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { exportData, loadHistory, loadProfiles } from '#lib/storage.ts';
  import { api, ApiError, formatDate } from '#lib/ui/app/api.ts';
  import { loadSession, session } from '#lib/ui/app/session.svelte.ts';
  import Art from '#lib/ui/art/Art.svelte';
  import GameCard from '#lib/ui/art/GameCard.svelte';
  import { GAME_ART, GAME_NAMES } from '#lib/ui/art/art.ts';
  import type { RoomGame } from '#lib/live/games.ts';

  interface NightRow {
    id: number;
    played_on: string;
    title: string | null;
    matches: number;
  }

  let email = $state('');
  let password = $state('');
  let pin = $state('');
  let householdName = $state('');
  let showLegacy = $state(false);
  let info = $state<string | null>(null);
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
      message = err instanceof ApiError ? err.message : 'Něco se nepovedlo. Zkus to znovu.';
    } finally {
      busy = false;
    }
  }

  function loginAccount(event: SubmitEvent) {
    event.preventDefault();
    run(async () => {
      await api('/api/auth/login', { body: { email, password } });
      password = '';
      await loadSession();
      loadToday();
    });
  }

  function loginPin(event: SubmitEvent) {
    event.preventDefault();
    run(async () => {
      await api('/api/login', { body: { pin, name: showLegacy && householdName.trim() ? householdName : undefined } });
      pin = '';
      await loadSession();
      loadToday();
    });
  }

  function resendVerification() {
    run(async () => {
      await api('/api/auth/verify/resend', { body: {} });
      info = 'Poslali jsme nový ověřovací odkaz.';
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

  function tvHref(game: RoomGame): string {
    return `/tv?hra=${game}${today ? `&night=${today.id}` : ''}`;
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

<svelte:head><title>Herní večer</title></svelte:head>

{#snippet freeGames()}
  <GameCard art={GAME_ART.kvizovna} title={`${GAME_NAMES.kvizovna} na tabletu`} text="Jeden tablet koluje kolem stolu. Funguje i bez účtu." href="/tablet" testid="game-tablet" />
  <GameCard art={GAME_ART.sachy} title={GAME_NAMES.sachy} text="Proti počítači, ve dvou nebo s lekcemi od sovy." href="/sachy" testid="game-sachy" />
  <GameCard art={GAME_ART.prsi} title={`Trénink: ${GAME_NAMES.prsi}`} text="Lekce a hra s počítačem." href="/trenink/prsi" testid="game-trenink-prsi" />
  <GameCard art={GAME_ART.zoliky} title={`Trénink: ${GAME_NAMES.zoliky}`} text="Lekce a hra s počítačem." href="/trenink/zoliky" testid="game-trenink-zoliky" />
{/snippet}

<main class="page stack home">
  <header class="hero" class:compact={!!session.household}>
    <div class="hero-pic">
      <Art name="hero.uvod" eager sizes="(max-width: 700px) 100vw, 1100px" />
    </div>
    <div class="hero-text">
      <h1>Herní večer</h1>
      <p class="muted">Kvízovna, Řekni-ukaž-nakresli, Město-jméno-zvíře, Šachy, Prší a Žolíky. Večery, tabulka sezóny a statistiky celé rodiny.</p>
    </div>
  </header>

  {#if !session.loaded}
    <p class="muted">Načítám…</p>
  {:else if session.offline}
    <section class="card stack">
      <h2>Server není dostupný</h2>
      <p class="muted">Ligu, večery a zápis karet teď uložit nejde. Hry níže fungují i bez serveru.</p>
      <div class="row">
        <button class="btn" onclick={() => loadSession()}>Zkusit znovu</button>
      </div>
    </section>
    <section class="games" aria-label="Hry bez účtu">{@render freeGames()}</section>
  {:else if !session.household}
    <section class="stack">
      <h2 class="section-title">Hrát hned, bez účtu</h2>
      <div class="games" aria-label="Hry bez účtu">{@render freeGames()}</div>
    </section>
    <h2 class="section-title">Přihlášení domácnosti</h2>
    <p class="muted intro">S účtem se večery, liga a statistiky ukládají a hraje se i na televizi s mobily.</p>
    <div class="login-grid">
      <form class="card stack narrow" onsubmit={loginAccount} data-testid="login">
        <h2>Přihlášení</h2>
        <label class="field"><span>E-mail</span><input type="email" bind:value={email} autocomplete="email" maxlength="254" /></label>
        <label class="field"><span>Heslo</span><input class="text-password" type="password" bind:value={password} autocomplete="current-password" maxlength="200" /></label>
        {#if message && !showLegacy && !session.deviceHousehold}<p class="note warn" role="alert">{message}</p>{/if}
        <button class="btn primary big" type="submit" disabled={busy || !email.trim() || !password}>Přihlásit</button>
        <div class="row between">
          <a href="/registrace" class="btn ghost">Založit domácnost</a>
          <a href="/ucet/zapomenute-heslo" class="small-link">Zapomenuté heslo</a>
        </div>
      </form>

      <form class="card stack narrow" onsubmit={loginPin} data-testid="pin-login">
        {#if session.deviceHousehold}
          <h2>Rychle PINem</h2>
          <p class="muted">Tohle zařízení patří domácnosti <strong>{session.deviceHousehold.name}</strong>.</p>
          {#if !session.deviceHousehold.has_pin}
            <p class="muted">PIN zatím není nastavený. Správce ho nastaví v Nastavení domácnosti.</p>
          {/if}
        {:else}
          <h2>PIN domácnosti</h2>
          <p class="muted">PIN funguje na zařízení, kde se už jednou přihlásil správce. Domácnost založená před zavedením účtů se přihlásí názvem a PINem.</p>
        {/if}
        <label class="field"><span>PIN domácnosti</span><input class="pin" type="password" inputmode="numeric" bind:value={pin} maxlength="8" autocomplete="current-password" /></label>
        {#if !session.deviceHousehold}
          {#if showLegacy}
            <label class="field"><span>Název domácnosti</span><input type="text" bind:value={householdName} maxlength="60" /></label>
          {:else}
            <button type="button" class="btn small ghost" onclick={() => (showLegacy = true)}>Domácnost bez účtu…</button>
          {/if}
        {/if}
        {#if message && (showLegacy || session.deviceHousehold)}<p class="note warn" role="alert">{message}</p>{/if}
        <button class="btn big" type="submit" disabled={busy || pin.length < 4}>Přihlásit PINem</button>
      </form>
    </div>
  {:else}
    {#if session.needsAccount}
      <a class="card note-card row" href="/domacnost" data-testid="needs-account">
        <span class="emoji big-emoji" aria-hidden="true">🔐</span>
        <span class="grow"><strong>Doplň účet správce</strong><br /><span class="muted">Domácnost zatím nemá e-mail a heslo. Bez nich nejde obnovit přístup ani stáhnout data.</span></span>
        <span class="btn primary">Doplnit účet</span>
      </a>
    {:else if session.account && !session.account.email_verified}
      <section class="card note-card stack" data-testid="verify-banner">
        <p><strong>Ověř svůj e-mail.</strong> Poslali jsme odkaz na {session.account.email}. Neověřený účet se po 30 dnech smaže.</p>
        <div class="row"><button class="btn small" onclick={resendVerification} disabled={busy}>Poslat odkaz znovu</button></div>
        {#if info}<p class="muted" role="status">{info}</p>{/if}
      </section>
    {/if}

    <div class="row night-row">
      {#if today}
        <a class="card today row grow" href={`/vecery/${today.id}`}>
          <Art name="rewards.vitez-vecera" size={56} decorative class="today-art" />
          <span class="grow"><strong>Dnešní večer</strong><br /><span class="muted">{today.title ?? formatDate(today.played_on)} · partií: {today.matches}</span></span>
          <span class="btn primary">Pokračovat</span>
        </a>
      {/if}
      <button class="btn primary big" onclick={newNight} disabled={busy}>🌙 Nový večer</button>
    </div>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}

    <section class="stack">
      <h2 class="section-title">Hry</h2>
      {#if today}<p class="muted intro">Partie se zapíšou do dnešního večera.</p>{/if}
      <div class="games" aria-label="Hry">
        <GameCard art={GAME_ART.kvizovna} title={GAME_NAMES.kvizovna} text="Otázky na televizi, odpovědi na mobilech." href={tvHref('quiz')} testid="game-kvizovna" />
        <GameCard art={GAME_ART.aktivity} title={GAME_NAMES.aktivity} text="Týmy vysvětlují slova slovem, pantomimou a kresbou." href={tvHref('aktivity')} testid="game-aktivity" />
        <GameCard art={GAME_ART.mjz} title={GAME_NAMES.mjz} text="Písmeno, kategorie, Stop! Píše se na mobilech." href={tvHref('mjz')} testid="game-mjz" />
        <GameCard art={GAME_ART.sachy} title={GAME_NAMES.sachy} text="Proti počítači, ve dvou nebo s lekcemi od sovy." href="/sachy" testid="game-sachy" />
        <GameCard art={GAME_ART.prsi} title={GAME_NAMES.prsi} text="Zápis partie s opravdovými kartami." href={cardsHref('prsi')} testid="game-prsi" />
        <GameCard art={GAME_ART.zoliky} title={GAME_NAMES.zoliky} text="Zápis partie s opravdovými kartami." href={cardsHref('zoliky')} testid="game-zoliky" />
        <GameCard art="cards.trenink" title="Trénink karet" text="Prší a žolíky se sovou: lekce a hra s počítačem." href="/trenink" testid="game-trenink" />
      </div>
      <div class="row more" aria-label="Další způsoby hry">
        <a class="btn" href={today ? `/tablet?night=${today.id}` : '/tablet'}>🦉 Kvízovna na jednom tabletu</a>
        <a class="btn" href={tvHref('chess')}>📺 Šachy na televizi</a>
        <a class="btn" href={tvHref('prsi-hra')}>📺 Prší na televizi</a>
        <a class="btn" href={tvHref('zoliky-hra')}>📺 Žolíky na televizi</a>
      </div>
    </section>

    <section class="stack">
      <h2 class="section-title">Rodina</h2>
      <div class="games small-games">
        <GameCard small art="cards.liga" title="Liga" text="Tabulka sezóny, ratingy a rekordy." href="/liga" />
        <GameCard small art="cards.vecery" title="Večery" text="Odehrané večery a jejich výsledky." href="/vecery" />
        <GameCard small art="cards.hraci" title="Hráči" text="Profily, avatary a týmy." href="/hraci" />
        <GameCard small art="cards.nastaveni" title="Nastavení domácnosti" text="Účet, PIN, pozvánky a data." href="/domacnost" />
      </div>
    </section>

    <section class="card stack">
      <h2>Import z tabletu</h2>
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
    flex-direction: column;
    gap: 14px;
  }
  .hero-pic {
    overflow: hidden;
    border: 2px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    background: var(--sage-light);
    aspect-ratio: 16 / 7;
  }
  .hero-pic :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .hero.compact .hero-pic {
    aspect-ratio: 16 / 4.5;
  }
  .hero-text h1 {
    font-size: 2.6rem;
    margin: 0;
  }
  .hero-text p {
    margin: 4px 0 0;
  }
  .intro {
    margin: 0;
  }
  .games {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }
  .small-games {
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  }
  .more .btn {
    min-height: 52px;
    font-size: 1.05rem;
  }
  .login-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
    align-items: start;
  }
  .note-card {
    text-decoration: none;
    color: inherit;
    background: var(--sage-light);
  }
  .note-card p {
    margin: 0;
  }
  .small-link {
    color: var(--ink-soft);
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-weight: 700;
  }
  input.pin {
    font: inherit;
    font-size: 1.6rem;
    letter-spacing: 0.3em;
    min-height: 60px;
    padding: 10px 16px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    width: 100%;
  }
  .night-row {
    align-items: stretch;
  }
  .today {
    text-decoration: none;
    color: inherit;
    background: var(--clay-light);
    border-color: var(--clay);
    padding: 12px 16px;
  }
  .today :global(.today-art) {
    width: 56px;
    height: 56px;
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
  @media (max-width: 700px) {
    .hero-pic,
    .hero.compact .hero-pic {
      aspect-ratio: 16 / 8;
    }
    .hero-text h1 {
      font-size: 2rem;
    }
    .games {
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
  }
  @media (max-width: 340px) {
    .games {
      grid-template-columns: 1fr;
    }
  }
</style>
