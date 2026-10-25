<script lang="ts">
  import Celebrate from './Celebrate.svelte';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  // Digital prší on the TV: the table for everyone — the card on top, the suit to follow, how many
  // cards each player holds, whose turn it is and what just happened. Hands stay on the phones.
  import './game.css';
  import { MARIAS_SUIT_LABELS, mariasCard } from '../../games/karty-hra/cards.ts';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import Card from '../karty-hra/Card.svelte';
  import CardLobby from './CardLobby.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import Countdown from './Countdown.svelte';
  import { prsiStandings, recentPrsi, seatName } from './card-helpers.ts';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.prsi);
  const isHost = $derived(view?.viewer === 'host');
  const recent = $derived(view ? recentPrsi(view, 6) : []);
  const lastOrder = $derived(view?.deals.at(-1) ?? []);
  const standings = $derived(view ? prsiStandings(view) : []);
  const seatOf = (id: string) => view?.seats.find((s) => s.id === id);
</script>

<main class="g-tv prsi-tv" data-testid="tv-prsi" data-phase={view?.roomPhase ?? 'loading'} data-turn={view?.turn ?? ''}>
  <header class="g-bar">
    <span class="g-brand">🃏 Prší</span>
    <span>Místnost <strong>{code}</strong></span>
    {#if view && view.settings.deals > 1}<span>Partie {view.dealIndex + 1}/{view.settings.deals}</span>{/if}
    <ConnectionBadge status={room.status} />
  </header>

  {#if room.status === 'failed'}
    <section class="card stack g-center g-narrow">
      <h1>😕 Místnost nejde otevřít</h1>
      <p>{room.error?.message}</p>
      <a class="btn primary big" href="/tv">Založit novou hru</a>
    </section>
  {:else if !view}
    <p class="g-center muted">Připojuji se k místnosti…</p>
  {:else}
    {#if !isHost}<p class="g-spectator">👀 Jen sledování — hostitelský klíč je v prohlížeči, kde se hra zakládala.</p>{/if}

    {#if view.roomPhase === 'lobby'}
      <CardLobby
        {code}
        seats={view.seats}
        presence={room.presence}
        {isHost}
        note={`${view.settings.handSize} karty do ruky · ${view.settings.deals === 1 ? 'jedna partie' : `${view.settings.deals} partie`}${view.turnSeconds ? ` · ${view.turnSeconds} s na tah` : ''}`}
        onStart={() => room.actPrsi({ type: 'start' })}
      />
    {:else}
      <section class="seats">
        {#each view.players as p (p.id)}
          <div class="seat" class:turn={view.turn === p.id && view.phase === 'playing'} data-testid="tv-seat" data-seat={p.id} data-cards={p.cards}>
            <span class="emoji g-avatar"><Avatar value={seatOf(p.id)?.avatar} fallback="🙂" px={96} /></span>
            <div class="stack tight">
              <strong>{p.name}</strong>
              <span class="muted">{p.place ? `${p.place}. místo` : `${p.cards} ${p.cards === 1 ? 'karta' : p.cards < 5 ? 'karty' : 'karet'}`}</span>
            </div>
            <div class="backs" aria-hidden="true">
              {#each Array.from({ length: Math.min(p.cards, 10) }) as _, i (i)}
                <span style="margin-left:{i ? -34 : 0}px"><Card faceDown width={44} /></span>
              {/each}
            </div>
          </div>
        {/each}
      </section>

      <section class="center">
        <div class="pile">
          <Card faceDown width={130} />
          <span class="muted">{view.stockCount} v balíčku</span>
        </div>
        <div class="pile" data-testid="discard" data-top={view.top}>
          {#key view.discardCount}<div class="drop"><Card id={view.top} width={170} /></div>{/key}
          <span class="suit-chip" data-testid="suit">
            {#if view.pendingSevens > 0}Sedma: další bere {view.pendingSevens * view.settings.drawPerSeven}{:else if view.pendingAce}Eso: další stojí{:else if mariasCard(view.top).rank === 'svrsek'}Přeje si: {MARIAS_SUIT_LABELS[view.suit]}{:else}{MARIAS_SUIT_LABELS[view.suit]}{/if}
          </span>
        </div>
        <div class="stack side">
          {#if view.phase === 'playing'}
            <p class="who" data-testid="tv-turn">Hraje <strong>{seatName(view.seats, view.turn)}</strong>{#if seatOf(view.turn)?.ai} 🤖{/if}</p>
            {#if view.deadline}<Countdown seconds={room.remaining} total={view.turnSeconds} />{/if}
          {/if}
          <ul class="log">
            {#each recent as line, i (i + line)}<li class:fresh={i === 0}>{line}</li>{/each}
          </ul>
        </div>
      </section>

      {#if view.phase === 'dealEnd' || view.phase === 'finished'}
        <section class="card stack result g-narrow" data-testid="result">
          <Celebrate size={110} />
          <h1>{view.phase === 'finished' ? 'Konec hry' : 'Konec partie'} — vyhrává {seatName(view.seats, (view.phase === 'finished' && view.deals.length > 1 ? standings[0]?.id : lastOrder[0]) ?? '')}</h1>
          <ol class="order">
            {#each lastOrder as id (id)}<li>{seatName(view.seats, id)}</li>{/each}
          </ol>
          {#if view.deals.length > 1}
            <table class="sheet">
              <thead><tr><th>Hráč</th><th>Součet míst</th><th>Výhry</th></tr></thead>
              <tbody>
                {#each standings as r (r.id)}<tr><td>{r.place}. {r.name}</td><td>{r.placeSum}</td><td>{r.wins}</td></tr>{/each}
              </tbody>
            </table>
          {/if}
          {#if view.phase === 'dealEnd'}
            {#if isHost}<button class="btn primary big" onclick={() => room.actPrsi({ type: 'nextDeal' })}>🃏 Další partie</button>{/if}
          {:else}
            <p class="muted">Výsledek lidí u stolu je zapsaný v lize (počítače se nepočítají).</p>
            {#if isHost}<a class="btn primary" href="/tv?hra=prsi-hra">Hrát znovu</a>{/if}
          {/if}
        </section>
      {/if}
    {/if}
  {/if}
  {#if room.error && room.status !== 'failed'}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
</main>

<style>
  .prsi-tv {
    background: radial-gradient(ellipse at 50% 55%, var(--sage-light) 0%, color-mix(in srgb, var(--sage-light) 75%, var(--sage)) 100%);
  }
  .seats {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    justify-content: center;
  }
  .seat {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: color-mix(in srgb, var(--paper) 85%, transparent);
    border: 3px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: 1.3rem;
    min-width: 260px;
  }
  .seat.turn {
    border-color: var(--clay);
    box-shadow: 0 0 0 4px var(--clay-light);
  }
  .tight {
    gap: 2px;
  }
  .backs {
    display: flex;
    margin-left: auto;
  }
  .center {
    display: grid;
    grid-template-columns: auto auto minmax(260px, 1fr);
    gap: 48px;
    align-items: center;
    justify-content: center;
  }
  .pile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-size: 1.2rem;
  }
  .drop {
    animation: drop 260ms ease-out;
  }
  @keyframes drop {
    from {
      transform: translateY(40px) scale(0.9);
      opacity: 0.4;
    }
  }
  .suit-chip {
    background: var(--paper);
    border: 2px solid var(--line);
    border-radius: 999px;
    padding: 4px 16px;
    font-weight: 800;
    font-size: 1.4rem;
  }
  .who {
    margin: 0;
    font-size: 1.8rem;
  }
  .log {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 1.2rem;
    color: var(--ink-soft);
  }
  .log .fresh {
    font-weight: 800;
    color: var(--ink);
    font-size: 1.45rem;
  }
  .order {
    font-size: 1.4rem;
  }
  .sheet {
    border-collapse: collapse;
    width: 100%;
  }
  .sheet th,
  .sheet td {
    border-bottom: 1px solid var(--line);
    padding: 6px 8px;
    text-align: left;
  }
  @media (prefers-reduced-motion: reduce) {
    .drop {
      animation: none;
    }
  }
  @media (max-width: 900px) {
    .center {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
