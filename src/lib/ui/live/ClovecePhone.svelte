<script lang="ts">
  // Člověče, nezlob se on a phone: the big „Hodit“ die, then the pawn to move — on the small board
  // or with the buttons below it. Children with hints get the owl: what to do, „Poraď“ with the
  // reason, and the youngest hear the steps counted aloud.
  import './game.css';
  import { onDestroy } from 'svelte';
  import { COLOR_LABELS, TRACK } from '../../games/clovece/engine.ts';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import { speak, stop } from '../../tts.ts';
  import Avatar from '../art/Avatar.svelte';
  import Owl from '../art/Owl.svelte';
  import Board from '../clovece/Board.svelte';
  import Die from '../clovece/Die.svelte';
  import Players from '../clovece/Players.svelte';
  import { NUMBER_WORDS, promptText, recentLines } from '../clovece/texts.ts';
  import Celebrate from './Celebrate.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import Countdown from './Countdown.svelte';
  import LobbyBackdrop from './LobbyBackdrop.svelte';
  import SeatPicker from './SeatPicker.svelte';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.clovece);
  const people = $derived((view?.seats ?? []).filter((s) => !s.ai));
  const me = $derived(room.me ? view?.seats.find((s) => s.id === room.me) : undefined);
  const mine = $derived(view && me ? view.players.find((p) => p.id === me.id) : undefined);
  const myTurn = $derived(!!view && !!me && view.phase === 'playing' && view.roomPhase !== 'lobby' && view.turn === me.id);
  const hints = $derived(!!me?.hints);
  const counting = $derived(hints && !!me && me.level !== 'hospoda' && me.level !== 'lavice');
  const myPlace = $derived(view && me ? (view.places[me.id] ?? null) : null);
  const lines = $derived(view ? recentLines(view.players, view.log, 2) : []);
  const turnName = $derived(view?.players.find((p) => p.id === view.turn)?.name ?? '');

  let advised = $state<{ text: string; pawn: number | null } | null>(null);
  let seenSeq = -1;
  $effect(() => {
    const seq = view?.seq ?? 0;
    if (seq !== seenSeq) {
      seenSeq = seq;
      advised = null;
    }
  });

  const owlText = $derived.by(() => {
    if (!view || !me) return '';
    if (advised) return advised.text;
    if (myPlace) return `Hurá, všechny figurky jsou doma — ${myPlace}. místo!`;
    if (!myTurn) return `Hraje ${turnName}…`;
    return promptText(me.name, view, view.moves);
  });

  // The youngest hear their prompt when the turn comes.
  let spoken = '';
  $effect(() => {
    if (!counting || !myTurn || !view) return;
    const key = `${view.turnCount}:${view.stage}:${view.seq}`;
    if (key === spoken) return;
    spoken = key;
    speak(owlText);
  });
  onDestroy(stop);

  function onStep(n: number) {
    if (counting && view?.lastMove?.playerId === me?.id) speak(NUMBER_WORDS[n] ?? String(n));
  }

  function advise() {
    if (!view?.hint) return;
    advised = view.hint;
    if (counting) speak(view.hint.text);
  }

  function moveLabel(m: (typeof view & {})['moves'][number]): string {
    if (m.kind === 'enter') return `Figurka ${m.pawn + 1}: nasadit na start`;
    if (m.to >= TRACK) return `Figurka ${m.pawn + 1}: do domečku`;
    return `Figurka ${m.pawn + 1}: o ${m.to - m.from} ${m.to - m.from === 1 ? 'pole' : m.to - m.from < 5 ? 'pole' : 'polí'}${m.captures ? ' a vyhodit' : ''}`;
  }
</script>

<main class="g-phone" data-testid="phone" data-game="clovece" data-phase={view?.roomPhase ?? 'loading'} data-me={room.me ?? ''} data-my-turn={myTurn ? 'yes' : 'no'} data-stage={view?.stage ?? ''} data-seq={view?.seq ?? 0}>
  <header class="g-bar">
    {#if me}
      <span><span class="emoji"><Avatar value={me.avatar} /></span> <strong>{me.name}</strong>{#if mine}{' · '}{COLOR_LABELS[mine.color]}{/if}</span>
    {:else}
      <span>🎲 Místnost <strong>{code}</strong></span>
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
    <LobbyBackdrop kind="phone" />
    <section class="g-wait-card stack g-center" data-testid="waiting">
      <div class="emoji g-huge"><Avatar value={me.avatar} px={192} /></div>
      <h1>Jsi ve hře!</h1>
      <p class="muted">Hraješ za {mine ? COLOR_LABELS[mine.color] : ''} barvu. Čekáme, až hostitel spustí hru na televizi.</p>
      <button class="btn small ghost" onclick={() => room.leave()}>Nejsem {me.name}</button>
    </section>
  {:else if view.phase === 'playing'}
    <section class="top-row">
      <Die value={view.dice} rollKey={view.seq} canRoll={myTurn && view.stage === 'roll'} onRoll={() => room.actClovece({ type: 'roll' })} size={88} />
      <div class="stack tight">
        <p class="status" data-testid="turn-status">{myTurn ? (view.stage === 'roll' ? 'Hoď kostkou!' : 'Vyber figurku') : `Hraje ${turnName}…`}</p>
        {#each lines as line, i (i + line)}<span class="muted small">{line}</span>{/each}
      </div>
    </section>

    {#if myTurn && view.deadline}<Countdown seconds={room.remaining} total={view.turnSeconds} />{/if}

    {#if hints || advised}
      <Owl pose={myTurn ? 'otazka' : 'premysli'} text={owlText} compact />
    {/if}

    <Board
      players={view.players}
      pawns={view.pawns}
      lastMove={view.lastMove}
      turn={view.turn}
      moves={myTurn ? view.moves : []}
      focus={advised?.pawn ?? null}
      interactive={myTurn && view.stage === 'move'}
      onPick={(pawn) => room.actClovece({ type: 'move', pawn })}
      {onStep}
    />

    {#if myTurn && view.stage === 'move'}
      <div class="moves">
        {#each view.moves as m (m.pawn)}
          <button type="button" class="btn" class:primary={advised?.pawn === m.pawn} data-testid="clovece-move" data-pawn={m.pawn} onclick={() => room.actClovece({ type: 'move', pawn: m.pawn })}>{moveLabel(m)}</button>
        {/each}
      </div>
    {/if}
    {#if hints && myTurn}
      <button type="button" class="btn clay" disabled={!view.hint} onclick={advise} data-testid="clovece-advise">🦉 Poraď</button>
    {/if}
  {:else}
    <section class="stack" data-testid="final">
      <Celebrate size={100} />
      <h1 class="g-center">{view.finished[0] === me.id ? 'Vyhrál(a) jsi!' : `Vyhrává ${view.players.find((p) => p.id === view.finished[0])?.name}`}</h1>
      <Players players={view.players} pawns={view.pawns} turn={view.turn} places={view.places} finished me={me.id} />
      <p class="muted g-center">Výsledek je zapsaný v lize.</p>
    </section>
  {/if}

  {#if room.error && room.status !== 'failed'}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
</main>

<style>
  .top-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .tight {
    gap: 2px;
  }
  .status {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 800;
  }
  .small {
    font-size: 0.9rem;
  }
  .moves {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .moves .btn {
    min-height: 52px;
  }
</style>
