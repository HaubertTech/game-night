<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiError } from '#lib/ui/app/api.ts';
  import { loadSession } from '#lib/ui/app/session.svelte.ts';

  let password = $state('');
  let password2 = $state('');
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
      await api('/api/auth/reset', { body: { token: page.url.searchParams.get('token') ?? '', password } });
      await loadSession();
      goto('/');
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Něco se nepovedlo.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Nové heslo · Herní večer</title></svelte:head>

<main class="page stack">
  <form class="card stack narrow" onsubmit={submit}>
    <h1>Nové heslo</h1>
    <label class="field"><span>Nové heslo (aspoň 10 znaků)</span><input class="text-password" type="password" bind:value={password} autocomplete="new-password" maxlength="200" /></label>
    <label class="field"><span>Heslo znovu</span><input class="text-password" type="password" bind:value={password2} autocomplete="new-password" maxlength="200" /></label>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}
    <button class="btn primary big" type="submit" disabled={busy || password.length < 10}>Nastavit heslo</button>
    <p class="muted">Po změně se odhlásí ostatní zařízení přihlášená tímto účtem. Zařízení přihlášená PINem zůstanou.</p>
  </form>
</main>
