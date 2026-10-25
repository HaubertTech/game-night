<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { api, ApiError } from '#lib/ui/app/api.ts';
  import { loadSession } from '#lib/ui/app/session.svelte.ts';

  let status = $state<'working' | 'ok' | 'error'>('working');
  let message = $state('');

  onMount(async () => {
    try {
      const res = await api<{ email: string }>('/api/auth/verify', { body: { token: page.url.searchParams.get('token') ?? '' } });
      message = `E-mail ${res.email} je ověřený.`;
      status = 'ok';
      loadSession();
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Ověření se nepovedlo.';
      status = 'error';
    }
  });
</script>

<svelte:head><title>Ověření e-mailu · Herní večer</title></svelte:head>

<main class="page stack">
  <section class="card stack narrow" data-testid="verify">
    <h1>Ověření e-mailu</h1>
    {#if status === 'working'}
      <p class="muted">Ověřuji…</p>
    {:else}
      <p class={status === 'ok' ? 'note' : 'note warn'} role="status">{message}</p>
      <div class="row"><a class="btn primary" href="/">Pokračovat</a></div>
    {/if}
  </section>
</main>
