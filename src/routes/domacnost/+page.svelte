<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError, formatDate } from '#lib/ui/app/api.ts';
  import Guard from '#lib/ui/app/Guard.svelte';
  import { loadSession, session } from '#lib/ui/app/session.svelte.ts';

  interface Settings {
    household: { id: number; name: string; has_pin: boolean };
    account: { id: number; email: string; email_verified: boolean };
    managers: { id: number; email: string; email_verified: boolean; me: boolean }[];
    invites: { id: number; email: string; expires_at: string }[];
  }

  let settings = $state<Settings | null>(null);
  let busy = $state(false);
  let message = $state<string | null>(null);
  let info = $state<string | null>(null);

  // „Doplnit účet“
  let claimEmail = $state('');
  let claimPassword = $state('');
  let claimAccept = $state(false);

  let newName = $state('');
  let pin = $state('');
  let inviteEmail = $state('');
  let currentPassword = $state('');
  let nextPassword = $state('');
  let deleteName = $state('');
  let deletePassword = $state('');
  let accountPassword = $state('');

  $effect(() => {
    if (session.role === 'manager') load();
  });

  async function load() {
    try {
      settings = await api<Settings>('/api/account');
      newName = settings.household.name;
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Nastavení se nepodařilo načíst.';
    }
  }

  async function run(fn: () => Promise<void>, done?: string) {
    busy = true;
    message = null;
    info = null;
    try {
      await fn();
      if (done) info = done;
      if (session.role === 'manager') await load();
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Něco se nepovedlo. Zkus to znovu.';
    } finally {
      busy = false;
    }
  }

  function claim(event: SubmitEvent) {
    event.preventDefault();
    run(async () => {
      await api('/api/account/claim', { body: { email: claimEmail, password: claimPassword, accept_terms: claimAccept } });
      claimPassword = '';
      await loadSession();
    }, 'Účet je doplněný. Na e-mail jsme poslali ověřovací odkaz.');
  }

  const rename = (e: SubmitEvent) => (e.preventDefault(), run(async () => {
    await api('/api/household', { method: 'PATCH', body: { name: newName } });
    await loadSession();
  }, 'Název je uložený.'));

  const savePin = (e: SubmitEvent) => (e.preventDefault(), run(async () => {
    await api('/api/household', { method: 'PATCH', body: { pin } });
    pin = '';
    await loadSession();
  }, 'PIN je nastavený. Na zařízeních, kde se správce přihlásil, teď stačí PIN.'));

  const removePin = () => run(async () => {
    await api('/api/household', { method: 'PATCH', body: { pin: null } });
    await loadSession();
  }, 'PIN je zrušený.');

  const invite = (e: SubmitEvent) => (e.preventDefault(), run(async () => {
    await api('/api/invites', { body: { email: inviteEmail } });
    inviteEmail = '';
  }, 'Pozvánka je odeslaná.'));

  const revoke = (id: number) => run(() => api(`/api/invites/${id}`, { method: 'DELETE' }).then(() => undefined), 'Pozvánka je zrušená.');

  const resend = () => run(() => api('/api/auth/verify/resend', { body: {} }).then(() => undefined), 'Poslali jsme nový ověřovací odkaz.');

  const changePassword = (e: SubmitEvent) => (e.preventDefault(), run(async () => {
    await api('/api/account/password', { body: { current_password: currentPassword, password: nextPassword } });
    currentPassword = '';
    nextPassword = '';
  }, 'Heslo je změněné. Ostatní zařízení přihlášená tímto účtem se odhlásila.'));

  const deleteAccount = (e: SubmitEvent) => {
    e.preventDefault();
    if (!confirm('Opravdu smazat svůj účet správce? Domácnost zůstane ostatním správcům.')) return;
    run(async () => {
      await api('/api/account', { method: 'DELETE', body: { password: accountPassword } });
      await loadSession();
      goto('/');
    });
  };

  const deleteHousehold = (e: SubmitEvent) => {
    e.preventDefault();
    if (!confirm(`Opravdu nevratně smazat domácnost ${session.household?.name} se všemi hráči, večery a výsledky?`)) return;
    run(async () => {
      await api('/api/household', { method: 'DELETE', body: { confirm_name: deleteName, password: deletePassword } });
      await loadSession();
      goto('/');
    });
  };

  function logoutEverywhere() {
    run(async () => {
      await api('/api/logout', { body: { forget_device: true } });
      await loadSession();
      goto('/');
    });
  }
</script>

<svelte:head><title>Nastavení domácnosti · Herní večer</title></svelte:head>

<main class="page stack">
  <h1>⚙️ Nastavení domácnosti</h1>
  <Guard>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}
    {#if info}<p class="note" role="status">{info}</p>{/if}

    {#if session.role === 'device' && session.needsAccount}
      <form class="card stack narrow" onsubmit={claim} data-testid="claim">
        <h2>Doplnit účet správce</h2>
        <p class="muted">Domácnost {session.household?.name} vznikla ještě bez účtu. Doplň e-mail a heslo správce: půjde pak obnovit přístup, stáhnout data a pozvat dalšího dospělého. PIN na tomhle zařízení dál funguje.</p>
        <label class="field"><span>E-mail</span><input type="email" bind:value={claimEmail} autocomplete="email" maxlength="254" /></label>
        <label class="field"><span>Heslo (aspoň 10 znaků)</span><input class="text-password" type="password" bind:value={claimPassword} autocomplete="new-password" maxlength="200" /></label>
        <label class="check">
          <input type="checkbox" bind:checked={claimAccept} />
          <span>Souhlasím s <a href="/podminky" target="_blank">podmínkami používání</a> a beru na vědomí <a href="/soukromi" target="_blank">zásady ochrany osobních údajů</a>.</span>
        </label>
        <button class="btn primary" type="submit" disabled={busy || !claimEmail.trim() || claimPassword.length < 10 || !claimAccept}>Doplnit účet</button>
      </form>
    {:else if session.role === 'device'}
      <section class="card stack narrow">
        <h2>Přihlášeno PINem</h2>
        <p class="muted">Na tomhle zařízení se hraje přes PIN domácnosti. Nastavení, export dat a mazání může jen správce přihlášený e-mailem a heslem.</p>
        <div class="row">
          <button class="btn" onclick={() => run(async () => { await api('/api/logout', { body: {} }); await loadSession(); goto('/'); })}>Odhlásit a přihlásit se e-mailem</button>
        </div>
      </section>
    {:else if settings}
      <section class="card stack">
        <h2>Účet</h2>
        <p>Přihlášen(a) jako <strong>{settings.account.email}</strong>{settings.account.email_verified ? ' · ověřeno' : ''}.</p>
        {#if !settings.account.email_verified}
          <div class="row"><span class="muted">E-mail není ověřený.</span><button class="btn small" onclick={resend} disabled={busy}>Poslat odkaz znovu</button></div>
        {/if}
        <form class="row" onsubmit={rename}>
          <label class="field grow"><span>Název domácnosti</span><input type="text" bind:value={newName} maxlength="60" /></label>
          <button class="btn" type="submit" disabled={busy || !newName.trim() || newName === settings.household.name}>Uložit</button>
        </form>
      </section>

      <section class="card stack">
        <h2>PIN pro sdílená zařízení</h2>
        <p class="muted">Na televizi nebo tabletu, kde se jednou přihlásíš e-mailem a heslem, pak stačí PIN. PIN smí jen hrát — nastavení a data zůstávají za heslem. Po pěti chybných PINech se na čtvrt hodiny zamkne.</p>
        <p>{settings.household.has_pin ? 'PIN je nastavený.' : 'PIN zatím nastavený není.'}</p>
        <form class="row" onsubmit={savePin}>
          <label class="field"><span>{settings.household.has_pin ? 'Nový PIN' : 'PIN'} (4–8 číslic)</span><input class="text-password" type="password" inputmode="numeric" bind:value={pin} maxlength="8" autocomplete="new-password" /></label>
          <button class="btn" type="submit" disabled={busy || !/^\d{4,8}$/.test(pin)}>Uložit PIN</button>
          {#if settings.household.has_pin}<button class="btn ghost" type="button" onclick={removePin} disabled={busy}>Zrušit PIN</button>{/if}
        </form>
      </section>

      <section class="card stack">
        <h2>Správci</h2>
        <ul class="list">
          {#each settings.managers as m (m.id)}
            <li>{m.email}{m.me ? ' (ty)' : ''}{m.email_verified ? '' : ' · neověřený'}</li>
          {/each}
        </ul>
        {#if settings.invites.length}
          <h3>Otevřené pozvánky</h3>
          <ul class="list">
            {#each settings.invites as i (i.id)}
              <li class="row">{i.email} <span class="muted">do {formatDate(i.expires_at)}</span><button class="btn small ghost" onclick={() => revoke(i.id)} disabled={busy}>Zrušit</button></li>
            {/each}
          </ul>
        {/if}
        <form class="row" onsubmit={invite}>
          <label class="field grow"><span>Pozvat dalšího dospělého (e-mail)</span><input type="email" bind:value={inviteEmail} maxlength="254" /></label>
          <button class="btn" type="submit" disabled={busy || !inviteEmail.trim() || !settings.account.email_verified}>Pozvat</button>
        </form>
        {#if !settings.account.email_verified}<p class="muted">Pozvat můžeš, až ověříš svůj e-mail.</p>{/if}
      </section>

      <section class="card stack">
        <h2>Heslo</h2>
        <form class="stack narrow" onsubmit={changePassword}>
          <label class="field"><span>Současné heslo</span><input class="text-password" type="password" bind:value={currentPassword} autocomplete="current-password" maxlength="200" /></label>
          <label class="field"><span>Nové heslo (aspoň 10 znaků)</span><input class="text-password" type="password" bind:value={nextPassword} autocomplete="new-password" maxlength="200" /></label>
          <div><button class="btn" type="submit" disabled={busy || !currentPassword || nextPassword.length < 10}>Změnit heslo</button></div>
        </form>
      </section>

      <section class="card stack">
        <h2>Vaše data</h2>
        <p class="muted">Všechno, co o domácnosti ukládáme — správci, hráči, večery, partie, odpovědi a hodnocení — si stáhneš jako soubor JSON. Hráče smažeš na stránce <a href="/hraci">Hráči</a>. Podrobnosti v <a href="/soukromi">zásadách ochrany údajů</a>.</p>
        <div class="row">
          <a class="btn" href="/api/household/export" download>⬇️ Stáhnout data domácnosti</a>
          <button class="btn ghost" onclick={logoutEverywhere} disabled={busy}>Odhlásit a zapomenout toto zařízení</button>
        </div>
      </section>

      {#if settings.managers.length > 1}
        <form class="card stack narrow danger" onsubmit={deleteAccount}>
          <h2>Smazat můj účet</h2>
          <p class="muted">Domácnost zůstane ostatním správcům.</p>
          <label class="field"><span>Heslo</span><input class="text-password" type="password" bind:value={accountPassword} autocomplete="current-password" maxlength="200" /></label>
          <div><button class="btn danger" type="submit" disabled={busy || !accountPassword}>Smazat můj účet</button></div>
        </form>
      {/if}

      <form class="card stack narrow danger" onsubmit={deleteHousehold} data-testid="delete-household">
        <h2>Smazat celou domácnost</h2>
        <p class="muted">Nevratně smaže domácnost, všechny správce, hráče, večery, partie a statistiky. Ze záloh data zmizí nejpozději do 14 dní. Předtím si můžeš stáhnout data.</p>
        <label class="field"><span>Pro potvrzení napiš název: {settings.household.name}</span><input type="text" bind:value={deleteName} maxlength="60" autocomplete="off" /></label>
        <label class="field"><span>Heslo</span><input class="text-password" type="password" bind:value={deletePassword} autocomplete="current-password" maxlength="200" /></label>
        <div><button class="btn danger" type="submit" disabled={busy || deleteName.trim() !== settings.household.name || !deletePassword}>Smazat domácnost</button></div>
      </form>
    {:else}
      <p class="muted">Načítám…</p>
    {/if}
  </Guard>
</main>

<style>
  h1 {
    margin: 8px 0 0;
  }
  .list {
    margin: 0;
    padding-left: 1.2em;
    display: grid;
    gap: 6px;
  }
  .danger {
    border-color: var(--bad);
  }
  form.row {
    align-items: flex-end;
    flex-wrap: wrap;
  }
</style>
