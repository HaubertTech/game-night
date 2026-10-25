<script lang="ts">
  // Člověče, nezlob se on the TV: the big board, the die, who is on turn and what just happened.
  // People roll and move on their phones; the TV only watches (the host starts the game).
  import './game.css';
  import { AI_LEVEL_LABELS } from '../../games/clovece/ai.ts';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import Board from '../clovece/Board.svelte';
  import Die from '../clovece/Die.svelte';
  import Players from '../clovece/Players.svelte';
  import { recentLines } from '../clovece/texts.ts';
  import CardLobby from './CardLobby.svelte';
  import Celebrate from './Celebrate.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import Countdown from './Countdown.svelte';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.clovece);
  const isHost = $derived(view?.viewer === 'host');
  const current = $derived(view?.players.find((p) => p.id === view.turn));
  const lines = $derived(view ? recentLines(view.players, view.log, 6) : []);
  const winner = $derived(view?.players.find((p) => p.id === view.finished[0]));
  const note = $derived(
    view
      ? [
          `${view.settings.pawns} figurky`,
          view.settings.capture ? null : 'bez vyhazování',
          view.settings.enterOnOne ? 'nasazení i jedničkou' : null,
          view.turnSeconds ? `${view.turnSeconds} s na tah` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '',
  );
</script>

<main class="g-tv clovece-tv" data-testid="tv-clovece" data-phase={view?.roomPhase ?? 'loading'} data-turn={view?.turn ?? ''}>
  <header class="g-bar">
    <span class="g-brand">🎲 Člověče, nezlob se</span>
    <span>Místnost <strong>{code}</strong></span>
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
        {note}
        startLabel="▶️ Začít hru"
        computerLabel={(s) => `🤖 počítač · ${AI_LEVEL_LABELS[s.ai!]}`}
        onStart={() => room.actClovece({ type: 'start' })}
      />
    {:else}
      <section class="table">
        <div class="board-wrap">
          <Board players={view.players} pawns={view.pawns} lastMove={view.lastMove} turn={view.turn} moves={view.moves} />
        </div>
        <aside class="stack side">
          {#if view.phase === 'playing' && current}
            <div class="turn">
              <Die value={view.dice} rollKey={view.seq} size={120} />
              <div class="stack tight">
                <p class="who" data-testid="tv-turn">Hraje <strong>{current.name}</strong>{#if current.ai} 🤖{/if}</p>
                <p class="muted">{view.stage === 'roll' ? (current.ai ? 'Počítač hází…' : 'Hází na telefonu') : 'Vybírá figurku'}</p>
                {#if view.deadline}<Countdown seconds={room.remaining} total={view.turnSeconds} />{/if}
              </div>
            </div>
          {/if}
          <Players players={view.players} pawns={view.pawns} turn={view.turn} places={view.places} finished={view.phase === 'finished'} big />
          <ul class="log">
            {#each lines as line, i (i + line)}<li class:fresh={i === 0}>{line}</li>{/each}
          </ul>
        </aside>
      </section>

      {#if view.phase === 'finished'}
        <section class="card stack result g-narrow" data-testid="result">
          <Celebrate size={110} />
          <h1>Konec hry — vyhrává {winner?.name}!</h1>
          <ol class="order">
            {#each view.finished as id (id)}<li>{view.players.find((p) => p.id === id)?.name}</li>{/each}
          </ol>
          <p class="muted">Výsledek lidí je zapsaný v lize (počítače se nepočítají).</p>
          {#if isHost}<a class="btn primary" href="/tv?hra=clovece">Hrát znovu</a>{/if}
        </section>
      {/if}
    {/if}
  {/if}
  {#if room.error && room.status !== 'failed'}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
</main>

<style>
  .clovece-tv {
    background: radial-gradient(ellipse at 40% 50%, var(--clay-light) 0%, var(--cream) 75%);
  }
  .table {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 440px);
    gap: 28px;
    align-items: start;
  }
  .board-wrap {
    width: min(100%, calc(100vh - 120px));
    margin: 0 auto;
  }
  .turn {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .tight {
    gap: 4px;
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
    font-size: 1.4rem;
  }
  .result {
    align-items: center;
    text-align: center;
  }
  .order {
    font-size: 1.4rem;
    text-align: left;
  }
  @media (max-width: 1000px) {
    .table {
      grid-template-columns: 1fr;
    }
  }
</style>
