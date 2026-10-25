<script lang="ts">
  // One chess game on a screen. Modes: 'ai' (against the computer), 'local' (two players on one
  // tablet) and 'room' (one side on a phone in a live room: the server owns the state, this screen
  // only sends commands and shows what the server sent).
  import { onDestroy, untrack } from 'svelte';
  import Board from './Board.svelte';
  import MoveList from './MoveList.svelte';
  import Owl from '#lib/ui/art/Owl.svelte';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import { aiAnalyze, aiMove } from './ai-client.ts';
  import { rememberFinished, saveGame, type SavedMode } from './storage.ts';
  import type { ChessRoomCommand } from '../../live/table-games.ts';
  import type { BoardMark } from './pieces.ts';
  import {
    applyChess,
    checkSquare,
    createChessGame,
    flagAt,
    legalMoves,
    remainingMs,
    toMatchResult,
    turnOf,
    type ChessAction,
    type ChessColor,
    type ChessState,
  } from '../../games/chess/engine.ts';
  import { AI_LEVEL_LABELS, materialBalance, type AiLevel } from '../../games/chess/ai.ts';
  import { BLUNDER_PAWNS, blunderText, explainMove, hintProfile, threatenedPieces, threatText } from '../../games/chess/learn/hints.ts';

  interface RoomLink {
    /** Side this phone plays; null = only watching. */
    color: ChessColor | null;
    send: (command: ChessRoomCommand) => void;
    /** Server clock (epoch ms) for the running clocks. */
    serverNow: () => number;
  }

  let {
    initial,
    mode,
    hintsEnabled = true,
    room,
    onexit,
    onfinished,
  }: {
    initial: ChessState;
    mode: SavedMode | 'room';
    hintsEnabled?: boolean;
    room?: RoomLink;
    onexit?: () => void;
    /** A game finished on this screen (local mode: the tablet records it to the league). */
    onfinished?: (state: ChessState) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let game = $state<ChessState>(initial);
  const inRoom = $derived(mode === 'room');
  // In a room the server state replaces the local one.
  $effect(() => {
    if (mode === 'room') game = initial;
  });
  let thinking = $state(false);
  let checking = $state(false);
  let advising = $state(false);
  let blunder = $state<string | null>(null);
  let note = $state<{ text: string; mood: 'mava' | 'otazka' | 'slavi' | 'premysli' } | null>(null);
  let marks = $state<BoardMark[]>([]);
  let adviceUsed = $state(0);
  let confirmResign = $state(false);
  let autoFlip = $state(false);
  let flipped = $state(false);
  let now = $state(Date.now());
  let hintsOn = $state(true);

  const turn = $derived(turnOf(game));
  const humanColor = $derived<ChessColor>(game.players.w.aiLevel ? 'b' : 'w');
  const aiColor = $derived<ChessColor | null>(mode === 'ai' ? (humanColor === 'w' ? 'b' : 'w') : null);
  const aiLevel = $derived((aiColor ? game.players[aiColor].aiLevel : 1) as AiLevel);
  const legal = $derived(game.result ? [] : legalMoves(game.fen));
  const check = $derived(checkSquare(game.fen));
  const last = $derived(game.moves.at(-1));
  const lastMove = $derived(last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null);
  const moverLevel = $derived(mode === 'ai' ? game.players[humanColor].level : inRoom && room?.color ? game.players[room.color].level : game.players[turn].level);
  const hints = $derived(hintProfile(moverLevel, hintsEnabled && hintsOn));
  const adviceLeft = $derived(hints.adviceLimit === null ? null : Math.max(0, hints.adviceLimit - adviceUsed));
  const interactive = $derived(
    !game.result && !thinking && !checking && !blunder && (inRoom ? !!room?.color && room.color === turn : mode === 'local' || turn === humanColor),
  );
  const baseOrientation = $derived<ChessColor>(mode === 'ai' ? humanColor : inRoom ? (room?.color ?? 'w') : autoFlip ? turn : 'w');
  const orientation = $derived<ChessColor>(flipped ? (baseOrientation === 'w' ? 'b' : 'w') : baseOrientation);
  const top = $derived<ChessColor>(orientation === 'w' ? 'b' : 'w');
  const balance = $derived(materialBalance(game.fen));

  // ---------- clock ----------
  const timer = setInterval(() => {
    if (!game.clock || game.result) return;
    if (inRoom) {
      // The server flags the clock; this screen only shows it.
      now = room?.serverNow() ?? Date.now();
      return;
    }
    now = Date.now();
    const at = flagAt(game);
    if (at !== null && now >= at) act({ type: 'timeout', now });
  }, 200);
  onDestroy(() => clearInterval(timer));

  function clockText(color: ChessColor): string | null {
    const ms = remainingMs(game, color, now);
    if (ms === null) return null;
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ---------- state changes ----------
  function act(action: ChessAction): boolean {
    if (inRoom) {
      if (!room?.color) return false;
      if (action.type === 'move') room.send({ type: 'move', uci: typeof action.move === 'string' ? action.move : action.move.from + action.move.to + (action.move.promotion ?? '') });
      else if (action.type === 'offerDraw' || action.type === 'acceptDraw' || action.type === 'declineDraw' || action.type === 'resign') room.send({ type: action.type });
      return true;
    }
    const r = applyChess(game, { ...action, now: action.now ?? Date.now() } as ChessAction);
    if (!r.ok) return false;
    const wasFinished = !!game.result;
    game = r.state;
    if (mode !== 'room') saveGame(mode, $state.snapshot(game) as ChessState);
    if (!wasFinished && game.result) finished();
    return true;
  }

  function finished() {
    marks = [];
    blunder = null;
    note = null;
    if (mode === 'local') {
      try {
        rememberFinished(toMatchResult($state.snapshot(game) as ChessState));
      } catch (err) {
        console.warn('[chess] could not remember the result', { err: (err as Error).message });
      }
    }
    onfinished?.($state.snapshot(game) as ChessState);
  }

  function warnThreats(color: ChessColor) {
    if (!hints.threatWarnings || game.result) return;
    const threats = threatenedPieces(game.fen, color);
    if (!threats.length) return;
    note = { text: threatText(threats[0]), mood: 'otazka' };
    marks = threats.map((t) => ({ square: t.square, tone: 'danger' as const }));
  }

  async function onmove(uci: string) {
    const before = $state.snapshot(game) as ChessState;
    note = null;
    marks = [];
    if (!act({ type: 'move', move: uci, by: turn })) return;
    if (inRoom || game.result) return;
    if (mode === 'ai' && hints.blunderCheck) {
      checking = true;
      try {
        const input = { fen: before.startFen, moves: before.moves.map((m) => m.uci) };
        const a = await aiAnalyze(input, { timeMs: 350, maxDepth: 6 });
        const b = await aiAnalyze({ fen: before.startFen, moves: [...input.moves, uci] }, { timeMs: 350, maxDepth: 6 });
        // a: our view before the move; b: the opponent's view after it.
        if (game.moves.length === before.moves.length + 1 && a.score + b.score >= BLUNDER_PAWNS * 100 && a.score < 50_000) {
          blunder = blunderText(game.fen, b.uci);
          marks = b.uci ? [{ square: b.uci.slice(2, 4), tone: 'danger' }] : [];
        }
      } catch (err) {
        console.warn('[chess] blunder check failed', { err: (err as Error).message });
      } finally {
        checking = false;
      }
    } else if (mode === 'local') warnThreats(turn);
  }

  // The computer plays whenever it is its turn and nothing is waiting for the human.
  $effect(() => {
    if (mode !== 'ai' || game.result || !aiColor || turn !== aiColor || thinking || checking || blunder) return;
    untrack(() => void playAi());
  });

  async function playAi() {
    thinking = true;
    const moveCount = game.moves.length;
    const started = Date.now();
    try {
      const r = await aiMove(
        { fen: game.startFen, moves: game.moves.map((m) => m.uci) },
        { level: aiLevel, seed: Math.floor(Math.random() * 2 ** 31) },
      );
      // Short pause so a move does not appear before the child sees the previous one.
      const wait = 450 - (Date.now() - started);
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      if (r.uci && game.moves.length === moveCount && !game.result) act({ type: 'move', move: r.uci, by: aiColor ?? undefined });
    } catch (err) {
      console.error('[chess] computer move failed', { err: (err as Error).message });
    } finally {
      thinking = false;
    }
    if (!game.result) warnThreats(humanColor);
  }

  async function advise() {
    if (advising || !interactive || adviceLeft === 0) return;
    advising = true;
    try {
      const r = await aiAnalyze({ fen: game.startFen, moves: game.moves.map((m) => m.uci) }, { timeMs: 900 });
      if (!r.uci) return;
      const e = explainMove(game.fen, r.uci);
      if (!e) return;
      adviceUsed++;
      note = { text: e.text, mood: 'otazka' };
      marks = [
        { square: e.from, tone: 'hint' },
        { square: e.to, tone: 'good' },
      ];
    } finally {
      advising = false;
    }
  }

  function undo() {
    blunder = null;
    note = null;
    marks = [];
    act({ type: 'undo' });
  }

  function keepPlaying() {
    blunder = null;
    marks = [];
  }

  async function offerDraw() {
    if (inRoom) {
      act({ type: 'offerDraw', by: room?.color ?? 'w' });
      return;
    }
    if (mode === 'local') {
      act({ type: 'offerDraw', by: turn });
      return;
    }
    if (!aiColor) return;
    const r = await aiAnalyze({ fen: game.startFen, moves: game.moves.map((m) => m.uci) }, { timeMs: 400 });
    const aiView = turn === aiColor ? r.score : -r.score;
    if (aiView <= -150) {
      act({ type: 'offerDraw', by: humanColor });
      act({ type: 'acceptDraw', by: aiColor });
    } else note = { text: 'Sova chce hrát dál. Remízu nepřijala.', mood: 'premysli' };
  }

  function resign() {
    confirmResign = false;
    act({ type: 'resign', by: mode === 'ai' ? humanColor : inRoom ? (room?.color ?? turn) : turn });
  }

  function rematch() {
    const swap = mode === 'local';
    const clock = game.clock ? { minutes: game.clock.initialMs / 60_000, incrementSeconds: game.clock.incrementMs / 1000 } : null;
    game = createChessGame({
      mode: game.mode,
      white: swap ? game.players.b : game.players.w,
      black: swap ? game.players.w : game.players.b,
      allowUndo: game.allowUndo,
      clock,
    });
    adviceUsed = 0;
    note = null;
    marks = [];
    if (mode !== 'room') saveGame(mode, $state.snapshot(game) as ChessState);
  }

  const status = $derived.by(() => {
    if (game.result) return game.result.text;
    if (inRoom && room?.color && game.drawOffer === room.color) return 'Nabídl(a) jsi remízu, soupeř se rozhoduje…';
    if (inRoom && room?.color && room.color === turn) return check ? 'Šach! Jsi na tahu.' : 'Jsi na tahu.';
    if (blunder) return 'Počkej…';
    if (thinking) return `${game.players[aiColor ?? 'b'].name} přemýšlí…`;
    if (checking) return 'Sova se dívá na tvůj tah…';
    const who = game.players[turn].name;
    return check ? `Šach! Na tahu: ${who}` : `Na tahu: ${who}`;
  });

  // After a loss to the computer the owl encourages instead of celebrating.
  const lostToComputer = $derived(!!game.result && !!aiColor && game.result.winner === aiColor);

  function playerLine(color: ChessColor) {
    const p = game.players[color];
    const diff = color === 'w' ? balance : -balance;
    return { p, diff: diff > 0 ? `+${diff}` : '', clock: clockText(color) };
  }
</script>

<div class="chess-game" data-testid="chess-game" data-mode={mode} data-result={game.result?.reason ?? ''}>
  <div class="board-col">
    {#each [top] as color (color)}
      {@const l = playerLine(color)}
      <div class="player" class:active={turn === color && !game.result}>
        <span class="avatar"><Avatar value={l.p.avatar} fallback={color === 'w' ? '⚪' : '⚫'} /></span>
        <span class="name">{l.p.name}{#if l.p.aiLevel && AI_LEVEL_LABELS[l.p.aiLevel as AiLevel].name !== l.p.name} · {AI_LEVEL_LABELS[l.p.aiLevel as AiLevel].name}{/if}</span>
        {#if l.diff}<span class="diff">{l.diff}</span>{/if}
        {#if l.clock}<span class="clock" class:low={(remainingMs(game, color, now) ?? 1e9) < 20_000} data-testid={`clock-${color}`}>{l.clock}</span>{/if}
      </div>
    {/each}

    <div class="board-box">
      <Board
        fen={game.fen}
        {orientation}
        {interactive}
        {legal}
        showDots={hints.showMoves}
        {lastMove}
        {check}
        {marks}
        {onmove}
      />
    </div>

    {#each [orientation] as color (color)}
      {@const l = playerLine(color)}
      <div class="player" class:active={turn === color && !game.result}>
        <span class="avatar"><Avatar value={l.p.avatar} fallback={color === 'w' ? '⚪' : '⚫'} /></span>
        <span class="name">{l.p.name}{#if l.p.aiLevel && AI_LEVEL_LABELS[l.p.aiLevel as AiLevel].name !== l.p.name} · {AI_LEVEL_LABELS[l.p.aiLevel as AiLevel].name}{/if}</span>
        {#if l.diff}<span class="diff">{l.diff}</span>{/if}
        {#if l.clock}<span class="clock" class:low={(remainingMs(game, color, now) ?? 1e9) < 20_000} data-testid={`clock-${color}`}>{l.clock}</span>{/if}
      </div>
    {/each}
  </div>

  <aside class="side stack">
    <p class="status" data-testid="chess-status" role="status">{status}</p>

    {#if game.result}
      <div class="card stack end" data-testid="chess-result">
        <Owl mood={lostToComputer ? 'mava' : 'slavi'} text={game.result.text} />
        {#if !inRoom}
          <div class="row">
            <button type="button" class="btn primary" onclick={rematch}>{mode === 'local' ? 'Odveta (barvy se prohodí)' : 'Hrát znovu'}</button>
            <button type="button" class="btn" onclick={() => onexit?.()}>Zpět na šachy</button>
          </div>
        {/if}
      </div>
    {:else if blunder}
      <Owl mood="otazka" text={blunder}>
        <button type="button" class="btn small primary" onclick={undo}>Vrátit tah</button>
        <button type="button" class="btn small" onclick={keepPlaying}>Hrát dál</button>
      </Owl>
    {:else if game.drawOffer && inRoom && room?.color && game.drawOffer !== room.color}
      <Owl mood="otazka" text={`${game.players[game.drawOffer].name} nabízí remízu. Přijmeš ji?`}>
        <button type="button" class="btn small primary" onclick={() => act({ type: 'acceptDraw', by: room.color! })}>Přijmout remízu</button>
        <button type="button" class="btn small" onclick={() => act({ type: 'declineDraw', by: room.color! })}>Hrát dál</button>
      </Owl>
    {:else if game.drawOffer && mode === 'local' && game.drawOffer !== turn}
      <Owl mood="otazka" text={`${game.players[game.drawOffer].name} nabízí remízu. ${game.players[turn].name}, přijmeš ji?`}>
        <button type="button" class="btn small primary" onclick={() => act({ type: 'acceptDraw', by: turn })}>Přijmout remízu</button>
        <button type="button" class="btn small" onclick={() => act({ type: 'declineDraw', by: turn })}>Hrát dál</button>
      </Owl>
    {:else if note}
      <Owl mood={note.mood} text={note.text} compact />
    {:else if thinking}
      <Owl mood="premysli" text="Počítač přemýšlí nad tahem…" compact />
    {/if}

    {#if !game.result}
      <div class="row tools">
        {#if hints.adviceLimit !== 0 && !inRoom}
          <button type="button" class="btn" disabled={!interactive || advising || adviceLeft === 0} onclick={advise}>
            🦉 Poraď{#if adviceLeft !== null}&nbsp;({adviceLeft}){/if}
          </button>
        {/if}
        {#if game.allowUndo}
          <button type="button" class="btn" disabled={!game.moves.length || thinking || checking} onclick={undo}>↶ Vrátit tah</button>
        {/if}
        <button type="button" class="btn" onclick={() => (flipped = !flipped)}><span aria-hidden="true">⟳</span> Otočit desku</button>
      </div>
      <div class="row tools">
        <button type="button" class="btn small" disabled={thinking || (inRoom && (!room?.color || game.drawOffer === room.color))} onclick={offerDraw}>½ Nabídnout remízu</button>
        {#if inRoom && !room?.color}
          <!-- spectators neither offer nor resign -->
        {:else if confirmResign}
          <button type="button" class="btn small clay" onclick={resign}>Opravdu se vzdát</button>
          <button type="button" class="btn small" onclick={() => (confirmResign = false)}>Ne</button>
        {:else}
          <button type="button" class="btn small" onclick={() => (confirmResign = true)}>🏳 Vzdát se</button>
        {/if}
      </div>
      <div class="row toggles">
        {#if mode === 'local'}
          <label><input type="checkbox" bind:checked={autoFlip} /> Otáčet desku k hráči na tahu</label>
        {/if}
        {#if hintsEnabled}
          <label><input type="checkbox" bind:checked={hintsOn} /> Nápovědy</label>
        {/if}
      </div>
    {/if}

    <MoveList {game} />
    {#if !game.result && !inRoom}
      <button type="button" class="btn small" onclick={() => onexit?.()}>Odložit partii</button>
    {/if}
  </aside>
</div>

<style>
  .chess-game {
    display: grid;
    gap: 18px;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }
  .board-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(100%, calc(100dvh - 300px));
    min-width: min(100%, 320px);
    margin: 0 auto;
  }
  @media (orientation: landscape) and (min-width: 820px) {
    .chess-game {
      grid-template-columns: auto minmax(260px, 1fr);
    }
    .board-col {
      width: min(62vw, calc(100dvh - 150px));
    }
  }
  .board-box {
    width: 100%;
  }
  .player {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    font-weight: 750;
  }
  .player.active {
    border-color: var(--sage);
    background: var(--sage-light);
  }
  .avatar {
    font-size: 1.6rem;
  }
  .name {
    flex: 1;
  }
  .diff {
    color: var(--sage-dark);
  }
  .clock {
    font-variant-numeric: tabular-nums;
    font-size: 1.35rem;
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 10px;
    padding: 2px 10px;
  }
  .clock.low {
    background: var(--bad-bg);
    color: var(--bad);
  }
  .status {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 800;
  }
  .tools .btn {
    flex: 1 1 auto;
  }
  .toggles label {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    min-height: 44px;
    font-weight: 650;
  }
  .toggles input {
    width: 24px;
    height: 24px;
  }
</style>
