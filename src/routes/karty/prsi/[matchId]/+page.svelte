<script lang="ts">
  import { page } from '$app/state';
  import { prsiSummary, type PrsiAction, type PrsiState } from '#lib/cards/prsi.ts';
  import { api, ApiError, placeMedal } from '#lib/ui/app/api.ts';
  import Guard from '#lib/ui/app/Guard.svelte';
  import { session } from '#lib/ui/app/session.svelte.ts';

  interface MatchView {
    id: number;
    night_id: number | null;
    status: string;
    state: PrsiState;
  }

  let match = $state<MatchView | null>(null);
  let order = $state<string[]>([]);
  let correcting = $state(false);
  let busy = $state(false);
  let message = $state<string | null>(null);

  $effect(() => {
    const id = page.params.matchId;
    if (session.household && id) load(id);
  });

  async function load(id: string) {
    try {
      match = (await api<{ match: MatchView }>(`/api/matches/${id}`)).match;
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Partii se nepodařilo načíst.';
    }
  }

  const sheetState = $derived(match?.state ?? null);
  const done = $derived(match?.status === 'finished');
  const names = $derived(new Map((sheetState?.players ?? []).map((p) => [p.id, p.name])));
  const summary = $derived(sheetState ? prsiSummary(sheetState) : []);

  async function send(action: PrsiAction): Promise<boolean> {
    if (!match) return false;
    busy = true;
    message = null;
    try {
      const res = await api<{ match: MatchView }>(`/api/matches/${match.id}/action`, { body: { action } });
      if (res.match.state.error) {
        message = res.match.state.error;
        return false;
      }
      match = res.match;
      return true;
    } catch (err) {
      message = err instanceof ApiError ? err.message : 'Zápis se nepovedl.';
      return false;
    } finally {
      busy = false;
    }
  }

  function tap(id: string) {
    if (!sheetState) return;
    if (order.includes(id)) {
      order = order.slice(0, order.indexOf(id));
      return;
    }
    const next = [...order, id];
    // The last one left holding cards is obvious.
    const rest = sheetState.players.filter((p) => !next.includes(p.id));
    order = rest.length === 1 ? [...next, rest[0].id] : next;
  }

  async function submit() {
    const ok = await send({ type: correcting ? 'replaceLast' : 'record', order });
    if (ok) {
      order = [];
      correcting = false;
    }
  }

  function startCorrection() {
    if (!sheetState?.deals.length) return;
    correcting = true;
    order = [];
  }

  async function finish() {
    if (!confirm('Ukončit hru a zapsat výsledek do ligy?')) return;
    await send({ type: 'finish' });
  }
</script>

<main class="page stack sheet" data-testid="prsi-sheet">
  <Guard>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}
    {#if sheetState && match}
      <header class="row between">
        <h1 class="section-title">🃏 Prší · partie {sheetState.deals.length + (done ? 0 : 1)}</h1>
        {#if match.night_id}<a class="btn small ghost" href={`/vecery/${match.night_id}`}>← Večer</a>{/if}
      </header>

      {#if !done}
        <section class="card stack">
          <h2 class="section-title">{correcting ? 'Oprava poslední partie' : 'Kdo se zbavil karet?'}</h2>
          <p class="muted">Ťukej na hráče v pořadí, jak dohráli. Druhé ťuknutí pořadí od toho hráče smaže.</p>
          <div class="order-grid" role="group" aria-label="Pořadí partie">
            {#each sheetState.players as p (p.id)}
              {@const pos = order.indexOf(p.id)}
              <button class="order-btn" class:picked={pos >= 0} onclick={() => tap(p.id)} disabled={busy}>
                <span class="pos" aria-hidden="true">{pos >= 0 ? `${pos + 1}.` : ''}</span>
                <span class="who">{p.name}</span>
              </button>
            {/each}
          </div>
          <div class="row">
            <button class="btn primary big" disabled={busy || order.length !== sheetState.players.length} onclick={submit}>
              {correcting ? '💾 Uložit opravu' : '✍️ Zapsat partii'}
            </button>
            {#if order.length}<button class="btn ghost" onclick={() => (order = [])}>Smazat výběr</button>{/if}
            {#if correcting}<button class="btn ghost" onclick={() => ((correcting = false), (order = []))}>Zrušit opravu</button>{/if}
          </div>
        </section>
      {/if}

      <section class="card stack">
        <h2 class="section-title">{done ? '🏆 Konečné pořadí' : 'Průběžné pořadí'}</h2>
        <table class="table" data-testid="prsi-summary">
          <thead><tr><th>#</th><th>Hráč</th><th class="num">Součet pořadí</th><th class="num">Výhry</th><th class="num">Poslední</th></tr></thead>
          <tbody>
            {#each summary as r (r.playerId)}
              <tr class:first={r.place === 1 && sheetState.deals.length > 0}>
                <td>{sheetState.deals.length ? placeMedal(r.place) : '–'}</td>
                <td>{names.get(r.playerId)}</td>
                <td class="num">{r.placeSum}</td>
                <td class="num">{r.wins}</td>
                <td class="num">{r.losses}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if sheetState.deals.length}
          <details>
            <summary>Zapsané partie ({sheetState.deals.length})</summary>
            <ol class="deals">
              {#each sheetState.deals as d, i (i)}
                <li>{d.order.map((id) => names.get(id)).join(' → ')}</li>
              {/each}
            </ol>
          </details>
        {/if}
      </section>

      {#if !done}
        <div class="row">
          <button class="btn" disabled={busy || !sheetState.deals.length} onclick={startCorrection}>✏️ Opravit poslední</button>
          <button class="btn ghost" disabled={busy || !sheetState.deals.length} onclick={() => send({ type: 'undo' })}>↩️ Vrátit poslední</button>
          <button class="btn clay" disabled={busy || !sheetState.deals.length} onclick={finish}>🏁 Konec hry</button>
        </div>
      {:else}
        <p class="note" role="status">Výsledek je zapsaný do ligy.</p>
        <div class="row">
          {#if match.night_id}<a class="btn primary big" href={`/vecery/${match.night_id}`}>Zpět do večera</a>{:else}<a class="btn primary big" href="/">Domů</a>{/if}
        </div>
      {/if}
    {/if}
  </Guard>
</main>

<style>
  .order-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
  .order-btn {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 92px;
    padding: 12px 18px;
    border: 3px solid var(--line);
    border-radius: var(--radius);
    background: #fff;
    font-size: 1.4rem;
    font-weight: 800;
    text-align: left;
  }
  .order-btn.picked {
    border-color: var(--sage-dark);
    background: var(--sage-light);
  }
  .pos {
    min-width: 2.2em;
    font-size: 1.8rem;
    color: var(--sage-dark);
  }
  .deals {
    margin: 8px 0 0;
    padding-left: 1.4em;
  }
</style>
