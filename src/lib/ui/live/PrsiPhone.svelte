<script lang="ts">
  // Digital prší on a phone: the own hand only. Tap a card to play it, a svršek asks for the
  // suit; the big button draws (or stands on an ace). Children with hints see which cards fit and
  // may ask the owl for advice.
  import './game.css';
  import { MARIAS_SUITS, MARIAS_SUIT_LABELS, mariasCard, type MariasSuit } from '../../games/karty-hra/cards.ts';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import Card from '../karty-hra/Card.svelte';
  import Hand from '../karty-hra/Hand.svelte';
  import Owl from '../karty-hra/Owl.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import Countdown from './Countdown.svelte';
  import SeatPicker from './SeatPicker.svelte';
  import { cardsWord, prsiStandings, recentPrsi, seatName } from './card-helpers.ts';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.prsi);
  const people = $derived((view?.seats ?? []).filter((s) => !s.ai));
  const me = $derived(room.me ? view?.seats.find((s) => s.id === room.me) : undefined);
  const myTurn = $derived(!!view && !!me && view.phase === 'playing' && view.roomPhase !== 'lobby' && view.turn === me.id);
  const hand = $derived(view?.hand ?? []);
  const hints = $derived(!!me?.hints);
  const penalty = $derived(view ? view.pendingSevens * view.settings.drawPerSeven : 0);
  const fallbackLabel = $derived(view?.pendingAce ? 'Stojím' : penalty ? `Vzít ${penalty} ${cardsWord(penalty)}` : 'Líznout si');
  const myPlace = $derived(view && me ? view.players.find((p) => p.id === me.id)?.place ?? null : null);
  const others = $derived((view?.players ?? []).filter((p) => p.id !== me?.id));
  const recent = $derived(view ? recentPrsi(view, 2) : []);
  const lastOrder = $derived(view?.deals.at(-1) ?? []);

  let picking = $state<string | null>(null);
  let note = $state<string | null>(null);
  let advised = $state<string[]>([]);

  // A new state clears the own notes.
  let seenSeq = -1;
  $effect(() => {
    const seq = view?.log.at(-1)?.seq ?? 0;
    if (seq !== seenSeq) {
      seenSeq = seq;
      note = null;
      advised = [];
      picking = null;
    }
  });

  const owlText = $derived.by(() => {
    if (!view || !me) return '';
    if (note) return note;
    if (myPlace) return `Hurá, jsi bez karet — ${myPlace}. místo! Ostatní hrají dál.`;
    if (!myTurn) return `Hraje ${seatName(view.seats, view.turn)}…`;
    if (view.pendingSevens > 0) return `Platí sedma! ${view.playable.length ? 'Přebij ji sedmou, nebo' : 'Nemáš sedmu, tak'} si vezmi ${penalty} ${cardsWord(penalty)}.`;
    if (view.pendingAce) return `Platí eso! ${view.playable.length ? 'Přebij ho esem, nebo stůj.' : 'Nemáš eso, tak jedno kolo stojíš.'}`;
    if (view.playable.length === 0) return 'Nemáš co dát — lízni si kartu.';
    return 'Jsi na řadě! Karty se zeleným rámečkem můžeš dát — mají stejnou barvu nebo hodnotu.';
  });

  function tap(id: string) {
    if (!view) return;
    if (!myTurn) {
      note = 'Počkej, teď hraje někdo jiný.';
      return;
    }
    if (!(view.playable as string[]).includes(id)) {
      note = view.pendingSevens > 0 ? 'Na sedmu jde jen sedma.' : view.pendingAce ? 'Na eso jde jen eso.' : 'Tahle karta nejde — musí mít stejnou barvu nebo hodnotu jako karta nahoře.';
      return;
    }
    if (mariasCard(id).rank === 'svrsek') {
      picking = id;
      return;
    }
    room.actPrsi({ type: 'play', cardId: id });
  }

  function chooseSuit(suit: MariasSuit) {
    const id = picking;
    picking = null;
    if (id) room.actPrsi({ type: 'play', cardId: id, suit });
  }

  function fallback() {
    room.actPrsi(view?.pendingAce ? { type: 'stand' } : { type: 'draw' });
  }

  function advise() {
    if (!view?.hint) return;
    note = view.hint.text;
    advised = view.hint.cardId ? [view.hint.cardId] : [];
  }
</script>

<main class="g-phone" data-testid="phone" data-game="prsi-hra" data-phase={view?.roomPhase ?? 'loading'} data-me={room.me ?? ''} data-my-turn={myTurn ? 'yes' : 'no'}>
  <header class="g-bar">
    {#if me}
      <span><span class="emoji">{me.avatar}</span> <strong>{me.name}</strong></span>
    {:else}
      <span>🃏 Místnost <strong>{code}</strong></span>
    {/if}
    <ConnectionBadge status={room.status} />
  </header>

  {#if room.status === 'failed'}
    <section class="card stack g-center">
      <h1>😕 Místnost nejde otevřít</h1>
      <p>{room.error?.message}</p>
      <a class="btn primary big" href="/m">Zadat jiný kód</a>
    </section>
  {:else if !view}
    <p class="g-center muted">Připojuji se…</p>
  {:else if !me}
    <SeatPicker seats={people} presence={room.presence} onPick={(id) => room.join(id)} />
  {:else if view.roomPhase === 'lobby'}
    <section class="stack g-center" data-testid="waiting">
      <div class="emoji g-huge">{me.avatar}</div>
      <h1>Jsi u stolu!</h1>
      <p class="muted">Čekáme, až hostitel na televizi rozdá karty.</p>
      <button class="btn small ghost" onclick={() => room.leave()}>Nejsem {me.name}</button>
    </section>
  {:else if view.phase === 'playing'}
    <section class="others" aria-label="Soupeři">
      {#each others as p (p.id)}
        <span class="other" class:turn={view.turn === p.id}>{p.name}: {p.place ? `${p.place}.` : `${p.cards} 🂠`}</span>
      {/each}
    </section>

    <section class="table-row">
      <div class="top" data-testid="discard" data-top={view.top}><Card id={view.top} width={92} /></div>
      <div class="stack tight">
        <span class="suit-chip" data-testid="suit">
          {#if view.pendingSevens > 0}Sedma: bere se {penalty}{:else if view.pendingAce}Eso: stojí se{:else if mariasCard(view.top).rank === 'svrsek'}Přeje si: {MARIAS_SUIT_LABELS[view.suit]}{:else}{MARIAS_SUIT_LABELS[view.suit]}{/if}
        </span>
        {#each recent as line, i (i + line)}<span class="muted small">{line}</span>{/each}
      </div>
    </section>

    {#if myTurn && view.deadline}<Countdown seconds={room.remaining} total={view.turnSeconds} />{/if}

    {#if hints || note || myPlace}
      <Owl pose={myTurn ? 'otazka' : 'premysli'} text={owlText} compact />
    {:else}
      <p class="status" data-testid="turn-status">{myTurn ? 'Jsi na řadě!' : `Hraje ${seatName(view.seats, view.turn)}…`}</p>
    {/if}

    {#if !myPlace}
      <Hand cards={hand} playable={hints && myTurn ? (view.playable as string[]) : null} {advised} disabled={!myTurn} onTap={tap} />
      <div class="row actions">
        <button type="button" class="btn primary big" data-testid="fallback" disabled={!myTurn} onclick={fallback}>{fallbackLabel}</button>
        {#if hints}
          <button type="button" class="btn clay" disabled={!myTurn || !view.hint} onclick={advise}>🦉 Poraď</button>
        {/if}
      </div>
    {/if}
  {:else}
    <section class="stack" data-testid="final">
      <h1 class="g-center">{lastOrder[0] === me.id ? '🏆 Vyhrál(a) jsi!' : `🏆 Vyhrává ${seatName(view.seats, lastOrder[0] ?? '')}`}</h1>
      <ol class="order">
        {#each view.phase === 'finished' && view.deals.length > 1 ? prsiStandings(view).map((r) => r.id) : lastOrder as id (id)}
          <li class:mine={id === me.id}>{seatName(view.seats, id)}</li>
        {/each}
      </ol>
      {#if view.phase === 'dealEnd'}
        <button class="btn primary big" onclick={() => room.actPrsi({ type: 'nextDeal' })}>🃏 Další partie</button>
      {:else}
        <p class="muted g-center">Výsledek je zapsaný v lize.</p>
      {/if}
    </section>
  {/if}

  {#if picking}
    <div class="overlay" role="dialog" aria-modal="true" aria-label="Vyber barvu">
      <div class="card stack">
        <h2>Jakou barvu si přeješ?</h2>
        <div class="suits">
          {#each MARIAS_SUITS as suit (suit)}
            <button type="button" class="btn suit-btn" data-testid="suit-choice" onclick={() => chooseSuit(suit)}>
              <Card id="{suit}-eso" width={52} label={MARIAS_SUIT_LABELS[suit]} />
              {MARIAS_SUIT_LABELS[suit]}
            </button>
          {/each}
        </div>
        <button type="button" class="btn ghost small" onclick={() => (picking = null)}>Zpět</button>
      </div>
    </div>
  {/if}
  {#if room.error && room.status !== 'failed'}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
</main>

<style>
  .others {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .other {
    padding: 4px 10px;
    border: 2px solid var(--line);
    border-radius: 999px;
    background: var(--paper);
    font-weight: 700;
  }
  .other.turn {
    border-color: var(--clay);
  }
  .table-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .tight {
    gap: 4px;
  }
  .small {
    font-size: 0.9rem;
  }
  .suit-chip {
    align-self: flex-start;
    background: var(--paper);
    border: 2px solid var(--line);
    border-radius: 999px;
    padding: 2px 12px;
    font-weight: 800;
  }
  .status {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 800;
    text-align: center;
  }
  .actions {
    justify-content: center;
  }
  .order {
    font-size: 1.3rem;
  }
  .order .mine {
    font-weight: 800;
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(59, 51, 43, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 30;
    padding: 16px;
  }
  .suits {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .suit-btn {
    flex-direction: column;
  }
</style>
