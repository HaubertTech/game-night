<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, ApiError } from '#lib/ui/app/api.ts';
  import { loadSession } from '#lib/ui/app/session.svelte.ts';

  let email = $state('');
  let password = $state('');
  let password2 = $state('');
  let householdName = $state('');
  let accept = $state(false);
  let busy = $state(false);
  let message = $state<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = null;
    if (password !== password2) {
      message = 'Hesla se neshodují.';
      return;
    }
    busy = true;
    try {
      await api('/api/auth/register', { body: { email, password, household_name: householdName, accept_terms: accept } });
      await loadSession();
      goto('/');
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Něco se nepovedlo.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Založit domácnost · Herní večer</title></svelte:head>

<main class="page stack">
  <p><a href="/">← Zpět</a></p>
  <form class="card stack narrow" onsubmit={submit} data-testid="register">
    <h1>Založit domácnost</h1>
    <p class="muted">Účet má správce domácnosti (dospělý). Hráči — i děti — jsou jen profily bez účtu, založíš je potom.</p>
    <label class="field"><span>Název domácnosti</span><input type="text" bind:value={householdName} maxlength="60" placeholder="např. Novákovi" /></label>
    <label class="field"><span>E-mail</span><input type="email" bind:value={email} autocomplete="email" maxlength="254" /></label>
    <label class="field"><span>Heslo (aspoň 10 znaků)</span><input class="text-password" type="password" bind:value={password} autocomplete="new-password" maxlength="200" /></label>
    <label class="field"><span>Heslo znovu</span><input class="text-password" type="password" bind:value={password2} autocomplete="new-password" maxlength="200" /></label>
    <label class="check">
      <input type="checkbox" bind:checked={accept} />
      <span>Souhlasím s <a href="/podminky" target="_blank">podmínkami používání</a> a beru na vědomí <a href="/soukromi" target="_blank">zásady ochrany osobních údajů</a>.</span>
    </label>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}
    <button class="btn primary big" type="submit" disabled={busy || !email.trim() || password.length < 10 || !householdName.trim() || !accept}>Založit domácnost</button>
    <p class="muted">Na e-mail pošleme odkaz pro ověření. Neověřený účet se po 30 dnech sám smaže.</p>
  </form>
</main>
