<script lang="ts">
  // Chess room on the TV: lobby with the join code, then the board for the spectators with both
  // clocks, the move list and the result. The TV never moves; the players use their phones.
  import './game.css';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import { checkSquare, remainingMs, turnOf, type ChessColor } from '../../games/chess/engine.ts';
  import Board from '../chess/Board.svelte';
  import MoveList from '../chess/MoveList.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import JoinPanel from './JoinPanel.svelte';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.chess);
  const game = $derived(view?.game);
  const isHost = $derived(view?.viewer === 'host');
  const turn = $derived(game ? turnOf(game) : 'w');
  const last = $derived(game?.moves.at(-1));
  const lastMove = $derived(last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null);
  const check = $derived(game ? checkSquare(game.fen) : null);

  function clockText(color: ChessColor): string | null {
    if (!game) return null;
    const ms = remainingMs(game, color, room.serverNow());
    if (ms === null) return null;
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function presenceLabel(id: string): string {
    const p = room.presence[id];
    if (p?.online) return '📱 připojen(a)';
    if (p?.claimed) return '📴 telefon odpojen';
    return '⏳ čeká na telefon';
  }

  const status = $derived.by(() => {
    if (!game) return '';
    if (game.result) return game.result.text;
    if (game.drawOffer) return `${game.players[game.drawOffer].name} nabízí remízu…`;
    const who = game.players[turn].name;
    return check ? `Šach! Na tahu: ${who}` : `Na tahu: ${who}`;
  });
</script>

<main class="g-tv" data-testid="tv-chess" data-phase={view?.phase ?? 'loading'}>
  <header class="g-bar">
    <span class="g-brand">♟️ Šachy</span>
    <span>Místnost <strong>{code}</strong></span>
    <ConnectionBadge status={room.status} />
  </header>

  {#if room.status === 'failed'}
    <section class="card stack g-center g-narrow">
      <h1>😕 Místnost nejde otevřít</h1>
      <p>{room.error?.message}</p>
      <a class="btn primary big" href="/tv">Založit novou hru</a>
    </section>
  {:else if !view || !game}
    <p class="g-center muted">Připojuji se k místnosti…</p>
  {:else}
    {#if !isHost}<p class="g-spectator">👀 Jen sledování — hostitelský klíč je v prohlížeči, kde se hra zakládala.</p>{/if}

    {#if view.phase === 'lobby'}
      <section class="g-lobby">
        <JoinPanel {code} />
        <div class="stack">
          <h1>Kdo hraje</h1>
          <ul class="g-people">
            {#each ['w', 'b'] as const as color (color)}
              {@const p = game.players[color]}
              <li data-testid="lobby-contestant" data-contestant={p.id} data-online={room.presence[p.id]?.online ? 'yes' : 'no'}>
                <span class="emoji g-avatar">{p.avatar ?? '🙂'}</span>
                <strong class="g-grow">{color === 'w' ? '⚪' : '⚫'} {p.name}</strong>
                <span class="muted">{presenceLabel(p.id)}</span>
              </li>
            {/each}
          </ul>
          <p class="muted">Bílé začínají tahem na svém telefonu{game.clock ? `, hodiny se rozběhnou po prvním tahu (${game.clock.initialMs / 60_000} min${game.clock.incrementMs ? ` + ${game.clock.incrementMs / 1000} s` : ''})` : ''}.</p>
        </div>
      </section>
    {/if}

    <section class="chess-tv" class:dim={view.phase === 'lobby'}>
      <div class="board-col">
        {#each ['b', 'w'] as const as color (color)}
          {@const p = game.players[color]}
          {@const clock = clockText(color)}
          {#if color === 'w'}
            <div class="board-box"><Board fen={game.fen} orientation="w" interactive={false} {lastMove} {check} /></div>
          {/if}
          <div class="player" class:active={turn === color && !game.result} data-testid={`tv-player-${color}`}>
            <span class="emoji">{p.avatar ?? (color === 'w' ? '⚪' : '⚫')}</span>
            <strong class="g-grow">{p.name}</strong>
            {#if clock}<span class="clock" class:low={(remainingMs(game, color, room.serverNow()) ?? 1e9) < 20_000} data-testid={`clock-${color}`}>{clock}</span>{/if}
          </div>
        {/each}
      </div>
      <aside class="stack side">
        <p class="status" data-testid="chess-status" role="status">{status}</p>
        {#if game.result}
          <div class="card stack" data-testid="chess-result">
            <h2>🏆 {game.result.text}</h2>
            <p class="muted">Výsledek je zapsaný v lize.</p>
            {#if isHost}<a class="btn primary" href="/tv?hra=chess">Další partie</a>{/if}
          </div>
        {/if}
        <MoveList {game} />
      </aside>
    </section>
  {/if}
</main>

<style>
  .chess-tv {
    display: grid;
    grid-template-columns: auto minmax(260px, 1fr);
    gap: 28px;
    align-items: start;
  }
  .chess-tv.dim {
    opacity: 0.55;
  }
  .board-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(60vw, calc(100vh - 220px));
  }
  .player {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    border: 2px solid transparent;
    border-radius: var(--radius-sm);
    font-size: 1.4rem;
  }
  .player.active {
    border-color: var(--sage);
    background: var(--sage-light);
  }
  .clock {
    font-variant-numeric: tabular-nums;
    font-size: 2rem;
    font-weight: 800;
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 12px;
    padding: 2px 14px;
  }
  .clock.low {
    background: var(--bad-bg);
    color: var(--bad);
  }
  .status {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 800;
  }
  .side :global(.moves) {
    font-size: 1.3rem;
  }
  @media (max-width: 900px) {
    .chess-tv {
      grid-template-columns: 1fr;
    }
    .board-col {
      width: 100%;
    }
  }
</style>
