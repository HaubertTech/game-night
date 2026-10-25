<script lang="ts">
  import { page } from '$app/state';
  import { activePlayers, isFinished, zolikyRanking, zolikySheet, type ZolikyAction, type ZolikyState } from '#lib/cards/zoliky.ts';
  import { api, ApiError, placeMedal } from '#lib/ui/app/api.ts';
  import Guard from '#lib/ui/app/Guard.svelte';
  import { session } from '#lib/ui/app/session.svelte.ts';

  interface MatchView {
    id: number;
    night_id: number | null;
    status: string;
    state: ZolikyState;
  }

  let match = $state<MatchView | null>(null);
  let winnerId = $state<string | null>(null);
  let fromHand = $state(false);
  let entries = $state<Record<string, string>>({});
  let focusId = $state<string | null>(null);
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
  const recorded = $derived(match?.status === 'finished');
  const sheet = $derived(sheetState ? zolikySheet(sheetState) : null);
  const active = $derived(sheetState ? activePlayers(sheetState) : []);
  const over = $derived(sheetState ? isFinished(sheetState) : false);
  const ranking = $derived(sheetState ? zolikyRanking(sheetState) : []);
  const others = $derived(active.filter((p) => p.id !== winnerId));
  const complete = $derived(winnerId !== null && others.every((p) => (entries[p.id] ?? '') !== ''));
  const names = $derived(new Map((sheetState?.players ?? []).map((p) => [p.id, p.name])));

  function pickWinner(id: string) {
    winnerId = id;
    const rest = active.filter((p) => p.id !== id);
    const { [id]: _drop, ...keep } = entries;
    entries = keep;
    focusId = rest.find((p) => (entries[p.id] ?? '') === '')?.id ?? rest[0]?.id ?? null;
  }

  function key(k: string) {
    if (!focusId) return;
    const current = entries[focusId] ?? '';
    if (k === 'back') entries = { ...entries, [focusId]: current.slice(0, -1) };
    else if (k === 'next') moveFocus();
    else if (current.length < 4) entries = { ...entries, [focusId]: current === '0' ? k : current + k };
  }

  function moveFocus() {
    const i = others.findIndex((p) => p.id === focusId);
    const next = others.slice(i + 1).concat(others.slice(0, i)).find((p) => (entries[p.id] ?? '') === '');
    focusId = next?.id ?? others[(i + 1) % others.length]?.id ?? null;
  }

  async function send(action: ZolikyAction): Promise<boolean> {
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

  async function addRound() {
    if (!winnerId) return;
    const hand = Object.fromEntries(others.map((p) => [p.id, Number(entries[p.id])]));
    if (await send({ type: 'addRound', winnerId, hand, fromHand })) {
      winnerId = null;
      fromHand = false;
      entries = {};
      focusId = null;
    }
  }

  async function finish() {
    if (!confirm('Ukončit hru a zapsat výsledek do ligy?')) return;
    await send({ type: 'finish' });
  }
</script>

<main class="page stack sheet" data-testid="zoliky-sheet">
  <Guard>
    {#if message}<p class="note warn" role="alert">{message}</p>{/if}
    {#if sheetState && sheet && match}
      <header class="row between">
        <h1 class="section-title">🂡 Žolíky · kolo {sheetState.rounds.length + (over ? 0 : 1)}</h1>
        {#if match.night_id}<a class="btn small ghost" href={`/vecery/${match.night_id}`}>← Večer</a>{/if}
      </header>
      <p class="muted">
        {sheetState.settings.maxRounds ? `${sheetState.settings.maxRounds} kol · ` : ''}{sheetState.settings.limit ? `Limit ${sheetState.settings.limit} bodů (${sheetState.settings.limitMode === 'eliminate' ? 'kdo přetáhne, vypadává' : 'pak hra končí'})` : 'Bez limitu'}
        · z ruky {sheetState.settings.closeFromHand.othersMultiplier > 1 ? `ostatním ×${sheetState.settings.closeFromHand.othersMultiplier}` : 'bez násobení'}
        · {sheetState.settings.lowerIsBetter ? 'vyhrává nejméně bodů' : 'vyhrává nejvíc bodů'}
      </p>

      <section class="card arch-wrap">
        <table class="table arch" data-testid="zoliky-arch">
          <thead>
            <tr>
              <th>Kolo</th>
              {#each sheetState.players as p (p.id)}<th class="num" class:out={p.id in sheet.eliminatedAfter}>{p.name}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each sheet.rows as row, i (i)}
              {@const r = sheetState.rounds[i]}
              <tr>
                <td>{i + 1}{r.fromHand ? ' ✋' : ''}</td>
                {#each sheetState.players as p (p.id)}
                  <td class="num">
                    {#if p.id in row.scores}{p.id === r.winnerId ? '★ ' : ''}{row.scores[p.id]}<span class="run">{row.totals[p.id]}</span>{:else}–{/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <th>Celkem</th>
              {#each sheetState.players as p (p.id)}<th class="num total" data-testid="zoliky-total">{sheet.totals[p.id]}</th>{/each}
            </tr>
          </tfoot>
        </table>
      </section>

      {#if !recorded && !over}
        <section class="card stack">
          <h2 class="section-title">Kdo zavřel?</h2>
          <div class="row" role="group" aria-label="Kdo zavřel">
            {#each active as p (p.id)}
              <button class="chip big-chip" aria-pressed={winnerId === p.id} onclick={() => pickWinner(p.id)}>{p.name}</button>
            {/each}
          </div>
          <div class="row">
            <button class="chip big-chip" aria-pressed={fromHand} onclick={() => (fromHand = !fromHand)}>✋ Zavřel z ruky</button>
          </div>
          {#if winnerId}
            <h3 class="section-title">Body ostatních</h3>
            <div class="entry">
              <div class="fields" role="group" aria-label="Body ostatních">
                {#each others as p (p.id)}
                  <button class="points-field" class:focus={focusId === p.id} aria-label={`Body ${p.name}`} onclick={() => (focusId = p.id)}>
                    <span class="who">{p.name}</span>
                    <span class="val">{entries[p.id] ?? ''}{#if fromHand && entries[p.id]}<span class="muted"> ×{sheetState.settings.closeFromHand.othersMultiplier}</span>{/if}</span>
                  </button>
                {/each}
              </div>
              <div class="keypad" role="group" aria-label="Klávesnice">
                {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as k (k)}
                  <button class="key" onclick={() => key(k)}>{k}</button>
                {/each}
                <button class="key" aria-label="Smazat číslici" onclick={() => key('back')}>⌫</button>
                <button class="key" onclick={() => key('0')}>0</button>
                <button class="key" aria-label="Další hráč" onclick={() => key('next')}>↵</button>
              </div>
            </div>
          {/if}
          <div class="row">
            <button class="btn primary big" disabled={busy || !complete} onclick={addRound}>✍️ Zapsat kolo</button>
          </div>
        </section>
      {/if}

      {#if over && !recorded}
        <p class="note" role="status">Hra skončila podle pravidel. Zkontroluj arch a zapiš výsledek.</p>
      {/if}

      <section class="card stack">
        <h2 class="section-title">{recorded ? '🏆 Konečné pořadí' : 'Průběžné pořadí'}</h2>
        <ol class="ranking" data-testid="zoliky-ranking">
          {#each ranking as r (r.playerId)}
            <li class:out={r.eliminated}>
              <span class="medal">{sheetState.rounds.length ? placeMedal(r.place) : '–'}</span>
              <span class="grow">{names.get(r.playerId)}</span>
              <span class="muted">{r.wins}× zavřel</span>
              <strong>{r.total}</strong>
            </li>
          {/each}
        </ol>
      </section>

      {#if !recorded}
        <div class="row">
          <button class="btn ghost" disabled={busy || !sheetState.rounds.length} onclick={() => send({ type: 'undo' })}>↩️ Vrátit kolo</button>
          <button class="btn clay" disabled={busy || !sheetState.rounds.length} onclick={finish}>🏁 {over ? 'Zapsat výsledek' : 'Konec hry'}</button>
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
  .arch-wrap {
    overflow-x: auto;
    padding: 10px 12px;
  }
  .arch td {
    white-space: nowrap;
  }
  .run {
    display: block;
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .total {
    font-size: 1.3rem;
    color: var(--ink);
  }
  .out {
    opacity: 0.45;
  }
  .big-chip {
    min-height: 64px;
    padding: 10px 22px;
    font-size: 1.25rem;
  }
  .entry {
    display: grid;
    grid-template-columns: 1fr minmax(240px, 320px);
    gap: 18px;
    align-items: start;
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .points-field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 68px;
    padding: 8px 18px;
    border: 3px solid var(--line);
    border-radius: var(--radius-sm);
    background: #fff;
    font-size: 1.3rem;
    font-weight: 750;
  }
  .points-field.focus {
    border-color: var(--slate-dark);
    background: var(--slate-light);
  }
  .val {
    font-size: 1.6rem;
    font-variant-numeric: tabular-nums;
  }
  .keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .key {
    min-height: 72px;
    border: 2px solid var(--ink);
    border-radius: var(--radius-sm);
    background: var(--paper);
    box-shadow: 0 3px 0 var(--ink);
    font-size: 1.8rem;
    font-weight: 800;
  }
  .key:active {
    transform: translateY(2px);
    box-shadow: 0 1px 0 var(--ink);
  }
  .ranking {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ranking li {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
    font-size: 1.15rem;
  }
  .medal {
    min-width: 2em;
  }
  @media (max-width: 700px) {
    .entry {
      grid-template-columns: 1fr;
    }
  }
</style>
