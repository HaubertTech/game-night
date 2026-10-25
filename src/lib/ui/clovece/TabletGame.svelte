<script lang="ts">
  // Člověče, nezlob se on one tablet: everybody at the same screen, computers move after a short
  // pause. Children with the owl's help see what to do, may ask „Poraď“ and hear the steps
  // counted. The running game is kept in the browser; a finished game of household players goes
  // to the league (the server replays it).
  import { onDestroy, onMount } from 'svelte';
  import { adviseClovece, cloveceAiStep } from '../../games/clovece/ai.ts';
  import { applyClovece, currentMoves, placesOf, type CloveceCommand, type CloveceState } from '../../games/clovece/engine.ts';
  import { speak, stop } from '../../tts.ts';
  import Owl from '../art/Owl.svelte';
  import Celebrate from '../live/Celebrate.svelte';
  import Board from './Board.svelte';
  import Die from './Die.svelte';
  import Players from './Players.svelte';
  import { saveGame, type SavedGame } from './storage.ts';
  import { NUMBER_WORDS, promptText, recentLines } from './texts.ts';

  let { saved, aiDelayMs = 900 }: { saved: SavedGame; aiDelayMs?: number } = $props();

  // svelte-ignore state_referenced_locally
  let game = $state.raw<CloveceState>(saved.state);
  // svelte-ignore state_referenced_locally
  let matchId = $state<number | null>(saved.matchId);
  let recordError = $state<string | null>(null);
  let advice = $state<{ text: string; pawn: number | null } | null>(null);
  let error = $state<string | null>(null);
  let aiTimer: ReturnType<typeof setTimeout> | null = null;

  const moves = $derived(currentMoves(game));
  const current = $derived(game.players.find((p) => p.id === game.turn)!);
  const human = $derived(game.phase === 'playing' && !current.ai);
  const help = $derived(saved.help[current.id] ?? { hints: false, speak: false });
  const places = $derived(placesOf(game));
  const lines = $derived(recentLines(game.players, game.log, 4));
  const owlText = $derived.by(() => {
    if (error) return error;
    if (advice) return advice.text;
    if (game.phase === 'finished') return `Konec hry! Vyhrává ${game.players.find((p) => p.id === game.finished[0])?.name}.`;
    if (!human) return `Hraje ${current.name}…`;
    return promptText(current.name, game, moves);
  });

  function persist() {
    saveGame({ ...saved, state: game, matchId });
  }

  function apply(command: CloveceCommand) {
    const r = applyClovece(game, { ...command, by: { role: 'host' }, now: Date.now() });
    if (!r.ok) {
      error = 'Tohle teď nejde.';
      return;
    }
    error = null;
    advice = null;
    game = r.state;
    persist();
  }

  function roll() {
    if (!human || game.stage !== 'roll') return;
    stop();
    apply({ type: 'roll' });
  }

  function pick(pawn: number) {
    if (!human || game.stage !== 'move') return;
    apply({ type: 'move', pawn });
  }

  function advise() {
    const a = adviseClovece(game, 3);
    advice = { text: a.reason, pawn: a.move?.pawn ?? null };
    if (help.speak) speak(a.reason);
  }

  /** Time the board needs to walk the last move (the next computer command waits for it). */
  function walkMs(g: CloveceState): number {
    const m = g.lastMove;
    if (!m || aiDelayMs === 0 || m.seq < g.seq - 1) return 0;
    return (m.from < 0 ? 1 : m.to - m.from) * 230;
  }

  // Computers move after a pause, one command at a time, so everybody can follow.
  $effect(() => {
    const g = game;
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = null;
    const seat = g.players.find((p) => p.id === g.turn);
    if (g.phase !== 'playing' || !seat?.ai) return;
    aiTimer = setTimeout(() => {
      try {
        game = cloveceAiStep(g, Date.now(), seat.ai!);
        persist();
      } catch (err) {
        console.error('[clovece] computer move failed', { err: (err as Error).message });
      }
    }, (g.stage === 'move' ? aiDelayMs : Math.round(aiDelayMs * 0.7)) + walkMs(g));
  });

  // The owl reads the prompt for the youngest when their turn starts.
  let spokenKey = '';
  $effect(() => {
    if (!human || !help.speak) return;
    const key = `${game.turnCount}:${game.stage}:${game.seq}`;
    if (key === spokenKey) return;
    spokenKey = key;
    speak(promptText(current.name, game, moves));
  });

  function onStep(n: number) {
    const mover = game.lastMove ? saved.help[game.lastMove.playerId] : undefined;
    if (mover?.speak) speak(NUMBER_WORDS[n] ?? String(n));
  }

  // Finished league game: record it once.
  $effect(() => {
    if (game.phase !== 'finished' || !saved.league || matchId !== null) return;
    void record();
  });

  async function record() {
    try {
      const res = await fetch('/api/matches/clovece', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          game: {
            id: game.id,
            createdAt: game.createdAt,
            seed: game.seed,
            settings: game.settings,
            players: game.players.map((p) => ({ id: p.id, ai: p.ai })),
            history: game.history,
          },
          ...(saved.nightId !== null ? { night_id: saved.nightId } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      matchId = body.match_id;
      recordError = null;
      persist();
    } catch (err) {
      recordError = (err as Error).message;
    }
  }

  onMount(() => persist());
  onDestroy(() => {
    if (aiTimer) clearTimeout(aiTimer);
    stop();
  });
</script>

<div class="game" data-testid="clovece-game" data-phase={game.phase} data-turn={game.turn} data-stage={game.stage} data-seq={game.seq}>
  <div class="board-wrap">
    <Board
      players={game.players}
      pawns={game.pawns}
      lastMove={game.lastMove}
      turn={game.turn}
      {moves}
      focus={help.hints ? (advice?.pawn ?? null) : null}
      interactive={human && game.stage === 'move'}
      onPick={pick}
      {onStep}
    />
  </div>

  <aside class="side stack">
    <div class="die-row">
      <Die value={game.dice} rollKey={game.seq} canRoll={human && game.stage === 'roll'} onRoll={roll} />
      <div class="stack tight">
        {#if game.phase === 'playing'}<p class="who">Na tahu: <strong>{current.name}</strong>{#if current.ai} 🤖{/if}</p>{/if}
        {#if human && help.hints}
          <button type="button" class="btn clay small" onclick={advise} data-testid="clovece-advise">🦉 Poraď</button>
        {/if}
      </div>
    </div>

    {#if human && (help.hints || error || advice)}
      <Owl pose={advice ? 'otazka' : 'mava'} text={owlText} compact />
    {:else}
      <p class="status" data-testid="clovece-status" role="status">{owlText}</p>
    {/if}

    <Players players={game.players} pawns={game.pawns} turn={game.turn} {places} finished={game.phase === 'finished'} />

    <ul class="log" aria-label="Poslední tahy">
      {#each lines as line, i (i + line)}<li class:fresh={i === 0}>{line}</li>{/each}
    </ul>
  </aside>

  {#if game.phase === 'finished'}
    <section class="card stack result" data-testid="clovece-result">
      <Celebrate size={100} />
      <h2>Vyhrává {game.players.find((p) => p.id === game.finished[0])?.name}!</h2>
      <ol>
        {#each game.finished as id (id)}<li>{game.players.find((p) => p.id === id)?.name}</li>{/each}
      </ol>
      {#if saved.league}
        {#if matchId !== null}<p class="muted" data-testid="clovece-recorded">Zapsáno do ligy (počítače se nepočítají).</p>
        {:else if recordError}<p class="error" role="alert">Do ligy se to nepovedlo zapsat: {recordError} <button class="btn small" onclick={record}>Zkusit znovu</button></p>
        {:else}<p class="muted">Zapisuji do ligy…</p>{/if}
      {/if}
      <div class="row">
        <a class="btn primary" href="/clovece">Nová hra</a>
      </div>
    </section>
  {/if}
</div>

<style>
  .game {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
    gap: 20px;
    align-items: start;
  }
  .board-wrap {
    max-width: min(100%, 78vh);
    width: 100%;
    margin: 0 auto;
  }
  .die-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .tight {
    gap: 8px;
  }
  .who {
    margin: 0;
    font-size: 1.2rem;
  }
  .status {
    margin: 0;
    font-weight: 700;
    font-size: 1.15rem;
  }
  .log {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--ink-soft);
  }
  .log .fresh {
    color: var(--ink);
    font-weight: 700;
  }
  .result {
    grid-column: 1 / -1;
    align-items: center;
    text-align: center;
  }
  .error {
    color: var(--bad);
    font-weight: 700;
  }
  @media (max-width: 900px) {
    .game {
      grid-template-columns: 1fr;
    }
  }
</style>
