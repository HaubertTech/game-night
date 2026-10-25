<script lang="ts">
  import Board from '#lib/ui/chess/Board.svelte';
  import LearnerBar from '#lib/ui/chess/LearnerBar.svelte';
  import Owl from '#lib/ui/chess/Owl.svelte';
  import type { Learner } from '#lib/ui/chess/storage.ts';
  import { PUZZLES } from '#lib/games/chess/learn/data.ts';
  import { PUZZLE_KIND_LABEL, isSolution, type Puzzle, type PuzzleKind } from '#lib/games/chess/learn/puzzles.ts';
  import { loadProgress, markPuzzle, saveProgress } from '#lib/games/chess/learn/lessons.ts';
  import { checkSquare, fenAfter, legalMoves } from '#lib/games/chess/engine.ts';
  import { explainMove } from '#lib/games/chess/learn/hints.ts';

  const KINDS: PuzzleKind[] = ['mate1', 'fork', 'material'];

  let learner = $state<Learner | null>(null);
  let kind = $state<PuzzleKind>('mate1');
  let current = $state<Puzzle | null>(null);
  let fen = $state('');
  let solved = $state(false);
  let lastMove = $state<{ from: string; to: string } | null>(null);
  let message = $state<{ text: string; mood: 'mava' | 'otazka' | 'slavi' | 'premysli' } | null>(null);
  let progressTick = $state(0);

  const progress = $derived.by(() => {
    void progressTick;
    return learner ? loadProgress(learner.id) : { steps: {}, puzzles: [] };
  });
  const list = $derived(PUZZLES.filter((p) => p.kind === kind));
  const solvedSet = $derived(new Set(progress.puzzles));

  function open(p: Puzzle) {
    current = p;
    fen = p.fen;
    solved = false;
    lastMove = null;
    message = null;
  }

  function next() {
    const i = list.findIndex((p) => p.id === current?.id);
    const after = list.slice(i + 1).find((p) => !solvedSet.has(p.id)) ?? list[i + 1];
    if (after) open(after);
    else current = null;
  }

  function onmove(uci: string) {
    if (!current || solved) return;
    if (!isSolution(current, uci)) {
      message = { text: 'To není ono. Zkus to znovu!', mood: 'premysli' };
      return;
    }
    const e = explainMove(fen, uci);
    lastMove = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
    fen = fenAfter(fen, uci);
    solved = true;
    message = { text: `Výborně! ${e?.reasons.join(' ') ?? ''}`.trim(), mood: 'slavi' };
    if (learner) {
      saveProgress(learner.id, markPuzzle(loadProgress(learner.id), current.id));
      progressTick++;
    }
  }
</script>

<svelte:head><title>Šachové úlohy · Domácí liga</title></svelte:head>

<main class="page stack">
  <a href={current ? '/sachy/ulohy' : '/sachy'} class="btn small back" onclick={(e) => { if (current) { e.preventDefault(); current = null; } }}>← {current ? 'Úlohy' : 'Šachy'}</a>
  <h1>🧩 Úlohy</h1>
  <LearnerBar bind:learner />

  {#if !current}
    <div class="row" role="group" aria-label="Druh úloh">
      {#each KINDS as k (k)}
        <button type="button" class="chip" aria-pressed={kind === k} onclick={() => (kind = k)}>
          {PUZZLE_KIND_LABEL[k].title} ({PUZZLES.filter((p) => p.kind === k && solvedSet.has(p.id)).length}/{PUZZLES.filter((p) => p.kind === k).length})
        </button>
      {/each}
    </div>
    <ol class="grid">
      {#each list as p, i (p.id)}
        <li>
          <button type="button" class="card tile" class:solved={solvedSet.has(p.id)} onclick={() => open(p)} data-testid={`puzzle-${p.id}`}>
            <strong>{i + 1}</strong>
            <span aria-hidden="true">{'★'.repeat(p.difficulty)}</span>
            {#if solvedSet.has(p.id)}<span class="muted">✓</span>{/if}
          </button>
        </li>
      {/each}
    </ol>
  {:else}
    <div class="layout" data-testid="puzzle" data-solved={solved}>
      <div class="board-col">
        <Board {fen} legal={solved ? [] : legalMoves(fen)} interactive={!solved} {lastMove} check={checkSquare(fen)} {onmove} />
      </div>
      <aside class="stack">
        <p class="task">{PUZZLE_KIND_LABEL[current.kind].task} Hraješ za {current.fen.split(' ')[1] === 'w' ? 'bílé' : 'černé'}.</p>
        {#if message}<Owl mood={message.mood} text={message.text} compact />{/if}
        <div class="row">
          {#if solved}
            <button type="button" class="btn big primary" onclick={next}>Další úloha →</button>
          {:else}
            <button type="button" class="btn" onclick={() => current && (message = { text: current.hint, mood: 'otazka' })}>💡 Nápověda</button>
          {/if}
        </div>
      </aside>
    </div>
  {/if}
</main>

<style>
  .back {
    align-self: flex-start;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 10px;
  }
  .tile {
    width: 100%;
    min-height: 90px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font: inherit;
    color: var(--ink);
    padding: 8px;
  }
  .tile strong {
    font-size: 1.4rem;
  }
  .tile.solved {
    background: var(--sage-light);
    border-color: var(--sage);
  }
  .layout {
    display: grid;
    gap: 18px;
  }
  .board-col {
    width: min(100%, calc(100dvh - 300px));
    min-width: min(100%, 300px);
    margin: 0 auto;
  }
  @media (orientation: landscape) and (min-width: 820px) {
    .layout {
      grid-template-columns: auto minmax(260px, 1fr);
      align-items: start;
    }
    .board-col {
      width: min(58vw, calc(100dvh - 190px));
    }
  }
  .task {
    font-size: 1.3rem;
    font-weight: 750;
    margin: 0;
  }
</style>
