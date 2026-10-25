<script lang="ts">
  import Celebrate from './Celebrate.svelte';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  // Digital žolíky on the TV: stock, the top of the discard pile and every laid-down combination,
  // the players with their card counts and totals. Hands stay on the phones.
  import './game.css';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import Card from '../karty-hra/Card.svelte';
  import CardLobby from './CardLobby.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import Countdown from './Countdown.svelte';
  import ZolikySheetTable from './ZolikySheetTable.svelte';
  import { recentZoliky, seatName, zolikyStandings } from './card-helpers.ts';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.zoliky);
  const isHost = $derived(view?.viewer === 'host');
  const recent = $derived(view ? recentZoliky(view, 6) : []);
  const standings = $derived(view ? zolikyStandings(view) : []);
  const seatOf = (id: string) => view?.seats.find((s) => s.id === id);
</script>

<main class="g-tv zoliky-tv" data-testid="tv-zoliky" data-phase={view?.roomPhase ?? 'loading'} data-turn={view?.turn ?? ''}>
  <header class="g-bar">
    <span class="g-brand">🂡 Žolíky</span>
    <span>Místnost <strong>{code}</strong></span>
    {#if view && view.roomPhase !== 'lobby'}<span>Kolo {view.roundIndex + 1}/{view.settings.rounds}</span>{/if}
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
        note={`${view.settings.rounds} ${view.settings.rounds === 1 ? 'kolo' : view.settings.rounds < 5 ? 'kola' : 'kol'} · první vyložení ${view.settings.openingMin} bodů a čistá postupka · vyhrává nejméně bodů${view.turnSeconds ? ` · ${view.turnSeconds} s na tah` : ''}`}
        onStart={() => room.actZoliky({ type: 'start' })}
      />
    {:else}
      <section class="seats">
        {#each view.players as p (p.id)}
          <div class="seat" class:turn={view.turn === p.id && view.phase === 'playing'} data-testid="tv-seat" data-seat={p.id} data-cards={p.cards}>
            <span class="emoji g-avatar"><Avatar value={seatOf(p.id)?.avatar} fallback="🙂" px={96} /></span>
            <div class="stack tight">
              <strong>{p.name}</strong>
              <span class="muted">{p.cards} karet · {p.opened ? 'vyloženo' : 'nevyloženo'} · {p.total} b.</span>
            </div>
          </div>
        {/each}
      </section>

      <section class="board">
        <div class="piles">
          <div class="pile">
            <Card faceDown back="french-0" width={110} />
            <span class="muted">Balíček ({view.stockCount})</span>
          </div>
          <div class="pile" data-testid="discard">
            {#if view.topDiscard}<Card id={view.topDiscard} width={110} />{:else}<span class="empty">—</span>{/if}
            <span class="muted">Odhozené ({view.discardCount})</span>
          </div>
        </div>
        <div class="melds" aria-label="Vyložené kombinace">
          {#each view.melds as m (m.id)}
            <div class="meld" data-testid="table-meld">
              <span class="muted small">{seatName(view.seats, m.owner)}</span>
              <span class="meld-cards">
                {#each m.slots as s, i (s.id)}<span style="margin-left:{i ? -26 : 0}px"><Card id={s.id} width={62} /></span>{/each}
              </span>
            </div>
          {:else}
            <p class="muted">Na stole zatím nic není.</p>
          {/each}
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

      {#if view.phase !== 'playing'}
        <section class="card stack g-narrow" data-testid="result">
          {#if view.phase === 'roundEnd' && view.lastRound}
            <h1>Zavírá {seatName(view.seats, view.lastRound.winnerId)}{view.lastRound.fromHand ? ' z ruky — ostatní mají body dvakrát!' : '!'}</h1>
          {:else}
            <Celebrate size={110} />
            <h1>Konec hry — vyhrává {standings[0]?.name}</h1>
          {/if}
          <ZolikySheetTable {view} />
          {#if view.phase === 'roundEnd'}
            {#if isHost}<button class="btn primary big" onclick={() => room.actZoliky({ type: 'nextRound' })}>🂡 Další kolo</button>{/if}
          {:else}
            <p class="muted">Výsledek lidí u stolu je zapsaný v lize i s body po kolech (počítače se nepočítají).</p>
            {#if isHost}<a class="btn primary" href="/tv?hra=zoliky-hra">Hrát znovu</a>{/if}
          {/if}
        </section>
      {/if}
    {/if}
  {/if}
  {#if room.error && room.status !== 'failed'}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
</main>

<style>
  .zoliky-tv {
    background: radial-gradient(ellipse at 50% 45%, var(--slate-light) 0%, color-mix(in srgb, var(--slate-light) 75%, var(--slate)) 100%);
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
    font-size: 1.25rem;
  }
  .seat.turn {
    border-color: var(--clay);
    box-shadow: 0 0 0 4px var(--clay-light);
  }
  .tight {
    gap: 2px;
  }
  .board {
    display: grid;
    grid-template-columns: auto 1fr minmax(240px, 0.6fr);
    gap: 28px;
    align-items: start;
  }
  .piles {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .pile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .empty {
    display: inline-flex;
    width: 110px;
    height: 165px;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--line);
    border-radius: 10px;
  }
  .melds {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-content: flex-start;
  }
  .meld {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--paper) 80%, transparent);
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .meld-cards {
    display: flex;
  }
  .small {
    font-size: 0.9rem;
  }
  .who {
    margin: 0;
    font-size: 1.7rem;
  }
  .log {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 1.15rem;
  }
  .log .fresh {
    font-weight: 800;
    font-size: 1.4rem;
  }
  @media (max-width: 1000px) {
    .board {
      grid-template-columns: 1fr;
    }
  }
</style>
