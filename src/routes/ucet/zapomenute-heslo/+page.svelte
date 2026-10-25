<script lang="ts">
  import { api, ApiError } from '#lib/ui/app/api.ts';

  let email = $state('');
  let busy = $state(false);
  let message = $state<string | null>(null);
  let sent = $state<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    message = null;
    try {
      sent = (await api<{ message: string }>('/api/auth/reset/request', { body: { email } })).message;
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Něco se nepovedlo. Zkus to znovu.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Zapomenuté heslo · Herní večer</title></svelte:head>

<main class="page stack">
  <p><a href="/">← Zpět</a></p>
  <form class="card stack narrow" onsubmit={submit}>
    <h1>Zapomenuté heslo</h1>
    {#if sent}
      <p class="note" role="status">{sent} Odkaz platí 60 minut.</p>
    {:else}
      <label class="field"><span>E-mail účtu</span><input type="email" bind:value={email} autocomplete="email" maxlength="254" /></label>
      {#if message}<p class="note warn" role="alert">{message}</p>{/if}
      <button class="btn primary big" type="submit" disabled={busy || !email.trim()}>Poslat odkaz</button>
    {/if}
  </form>
</main>
