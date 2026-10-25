<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiError } from '#lib/ui/app/api.ts';
  import { loadSession } from '#lib/ui/app/session.svelte.ts';

  const token = page.url.searchParams.get('token') ?? '';
  let invite = $state<{ email: string; household_name: string; account_exists: boolean } | null>(null);
  let password = $state('');
  let password2 = $state('');
  let accept = $state(false);
  let busy = $state(false);
  let message = $state<string | null>(null);

  onMount(async () => {
    try {
      invite = await api(`/api/invites/accept?token=${encodeURIComponent(token)}`);
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Pozvánku se nepodařilo načíst.';
    }
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = null;
    if (password !== password2) {
      message = 'Hesla se neshodují.';
      return;
    }
    busy = true;
    try {
      await api('/api/invites/accept', { body: { token, password, accept_terms: accept } });
      await loadSession();
      goto('/');
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Něco se nepovedlo.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Pozvánka · Herní večer</title></svelte:head>

<main class="page stack">
  <form class="card stack narrow" onsubmit={submit}>
    <h1>Pozvánka do domácnosti</h1>
    {#if invite}
      <p>Staneš se dalším správcem domácnosti <strong>{invite.household_name}</strong> s e-mailem <strong>{invite.email}</strong>.</p>
      {#if invite.account_exists}
        <p class="note warn">S tímto e-mailem už účet existuje. Jeden e-mail může spravovat jen jednu domácnost.</p>
      {:else}
        <label class="field"><span>Heslo (aspoň 10 znaků)</span><input class="text-password" type="password" bind:value={password} autocomplete="new-password" maxlength="200" /></label>
        <label class="field"><span>Heslo znovu</span><input class="text-password" type="password" bind:value={password2} autocomplete="new-password" maxlength="200" /></label>
        <label class="check">
          <input type="checkbox" bind:checked={accept} />
          <span>Souhlasím s <a href="/podminky" target="_blank">podmínkami používání</a> a beru na vědomí <a href="/soukromi" target="_blank">zásady ochrany osobních údajů</a>.</span>
        </label>
        {#if message}<p class="note warn" role="alert">{message}</p>{/if}
        <button class="btn primary big" type="submit" disabled={busy || password.length < 10 || !accept}>Přijmout pozvánku</button>
      {/if}
    {:else if message}
      <p class="note warn" role="alert">{message}</p>
      <div class="row"><a class="btn" href="/">Na úvod</a></div>
    {:else}
      <p class="muted">Načítám…</p>
    {/if}
  </form>
</main>
