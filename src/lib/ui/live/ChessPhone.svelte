<script lang="ts">
  // Chess room on a phone: pick white or black, then the shared GameScreen in room mode
  // (moves only on the own turn, draw offer, resignation).
  import './game.css';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import GameScreen from '../chess/GameScreen.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import SeatPicker from './SeatPicker.svelte';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.chess);
  const game = $derived(view?.game);
  const seats = $derived(
    game
      ? (['w', 'b'] as const).map((c) => ({
          id: game.players[c].id,
          name: game.players[c].name,
          avatar: game.players[c].avatar ?? '🙂',
          level: game.players[c].level ?? 'hospoda',
          group: c === 'w' ? '⚪ hraje bílými' : '⚫ hraje černými',
        }))
      : [],
  );
  const me = $derived(room.me && game ? (['w', 'b'] as const).find((c) => game.players[c].id === room.me) : undefined);
  const roomLink = $derived({ color: view?.color ?? null, send: (c: Parameters<LiveRoom['actChess']>[0]) => room.actChess(c), serverNow: () => room.serverNow() });
</script>

<main class="g-phone chess-phone" data-testid="phone" data-game="chess" data-phase={view?.phase ?? 'loading'} data-me={room.me ?? ''} data-color={view?.color ?? ''}>
  <header class="g-bar">
    {#if me && game}
      <span><span class="emoji">{game.players[me].avatar ?? '🙂'}</span> <strong>{game.players[me].name}</strong> · {me === 'w' ? '⚪ bílé' : '⚫ černé'}</span>
    {:else}
      <span>♟️ Místnost <strong>{code}</strong></span>
    {/if}
    <ConnectionBadge status={room.status} />
  </header>

  {#if room.status === 'failed'}
    <section class="card stack g-center">
      <h1>😕 Místnost nejde otevřít</h1>
      <p>{room.error?.message}</p>
      <a class="btn primary big" href="/m">Zadat jiný kód</a>
    </section>
  {:else if !view || !game}
    <p class="g-center muted">Připojuji se…</p>
  {:else if !me && !game.result}
    <SeatPicker {seats} presence={room.presence} onPick={(id) => room.join(id)} />
  {:else}
    <GameScreen initial={game} mode="room" room={roomLink} />
    {#if me && !game.result && view.phase === 'lobby'}
      <button class="btn small ghost" onclick={() => room.leave()}>Nejsem {game.players[me].name}</button>
    {/if}
  {/if}
  {#if room.error && room.status !== 'failed'}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
</main>

<style>
  .chess-phone {
    max-width: 720px;
  }
</style>
