<script lang="ts">
  // The owl's lesson: five short steps on a real board. The child rolls the prepared die and taps
  // the glowing pawn; the owl explains what happened. Reading aloud is on by default (the youngest
  // cannot read) and can be switched off.
  import { onDestroy } from 'svelte';
  import { applyClovece, currentMoves, type CloveceState } from '#lib/games/clovece/engine.ts';
  import { LESSON_STEPS, lessonState, YOU } from '#lib/games/clovece/lessons.ts';
  import Owl from '#lib/ui/art/Owl.svelte';
  import Celebrate from '#lib/ui/live/Celebrate.svelte';
  import Board from '#lib/ui/clovece/Board.svelte';
  import Die from '#lib/ui/clovece/Die.svelte';
  import { NUMBER_WORDS, rolledText } from '#lib/ui/clovece/texts.ts';
  import { speak, stop } from '#lib/tts.ts';

  let index = $state(0);
  let game = $state.raw<CloveceState>(lessonState(LESSON_STEPS[0]));
  let done = $state(false);
  let aloud = $state(true);
  let finished = $state(false);

  const step = $derived(LESSON_STEPS[index]);
  const moves = $derived(currentMoves(game));
  const canRoll = $derived(!done && game.stage === 'roll' && game.dice === null);
  const text = $derived(done ? step.outro : game.dice !== null && step.pawn !== null ? `${rolledText(game.dice)} Ťukni na figurku, která svítí.` : step.intro);

  $effect(() => {
    if (aloud) speak(text);
  });
  onDestroy(stop);

  function roll() {
    const r = applyClovece(game, { type: 'roll', by: { role: 'contestant', contestantId: YOU }, now: Date.now() });
    if (!r.ok) return;
    game = r.state;
    if (step.pawn === null) done = true;
  }

  function pick(pawn: number) {
    if (pawn !== step.pawn) return;
    const r = applyClovece(game, { type: 'move', pawn, by: { role: 'contestant', contestantId: YOU }, now: Date.now() });
    if (!r.ok) return;
    game = r.state;
    done = true;
  }

  function next() {
    if (index + 1 >= LESSON_STEPS.length) {
      finished = true;
      if (aloud) speak('Umíš to! Teď si zahraj s rodinou nebo s počítačem.');
      return;
    }
    index += 1;
    game = lessonState(LESSON_STEPS[index]);
    done = false;
  }

  function onStep(n: number) {
    if (aloud) speak(NUMBER_WORDS[n] ?? String(n));
  }
</script>

<svelte:head><title>Lekce: Člověče, nezlob se · Herní večer</title></svelte:head>

<main class="page stack" data-testid="clovece-lesson" data-step={step.id} data-done={done ? 'yes' : 'no'}>
  <div class="row head">
    <a href="/clovece" class="btn small ghost">← Člověče</a>
    <ol class="steps" aria-label="Kroky lekce">
      {#each LESSON_STEPS as s, i (s.id)}
        <li class:now={i === index && !finished} class:past={i < index || finished} aria-current={i === index && !finished ? 'step' : undefined}>{s.title}</li>
      {/each}
    </ol>
    <button type="button" class="chip" aria-pressed={aloud} onclick={() => {
      aloud = !aloud;
      if (!aloud) stop();
    }}>🔊 Číst nahlas</button>
  </div>

  {#if finished}
    <section class="card stack end" data-testid="clovece-lesson-end">
      <Celebrate size={110} />
      <h1>Umíš to!</h1>
      <p>Teď si zahraj s rodinou nebo s počítačem.</p>
      <div class="row">
        <a class="btn primary big" href="/clovece">🎲 Zahrát si</a>
        <button class="btn" onclick={() => { index = 0; game = lessonState(LESSON_STEPS[0]); done = false; finished = false; }}>Znovu od začátku</button>
      </div>
    </section>
  {:else}
    <div class="lesson">
      <div class="board-wrap">
        <Board
          players={game.players}
          pawns={game.pawns}
          lastMove={game.lastMove}
          turn={done ? null : game.turn}
          moves={done ? [] : moves.filter((m) => m.pawn === step.pawn)}
          interactive={!done}
          onPick={pick}
          {onStep}
          label={`Lekce: ${step.title}`}
        />
      </div>
      <aside class="stack">
        <h1>{index + 1}. {step.title}</h1>
        <Owl pose={done ? 'slavi' : 'otazka'} text={text} />
        <div class="row">
          <Die value={game.dice} rollKey={game.seq} {canRoll} onRoll={roll} />
          {#if done}
            <button class="btn primary big" onclick={next} data-testid="clovece-lesson-next">{index + 1 >= LESSON_STEPS.length ? 'Hotovo 🎉' : 'Další ➜'}</button>
          {/if}
        </div>
      </aside>
    </div>
  {/if}
</main>

<style>
  .head {
    align-items: center;
  }
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
  }
  .steps li {
    padding: 4px 12px;
    border-radius: 999px;
    border: 2px solid var(--line);
    background: var(--paper);
    font-weight: 700;
    color: var(--ink-soft);
  }
  .steps li.now {
    border-color: var(--clay);
    color: var(--ink);
  }
  .steps li.past {
    background: var(--sage-light);
  }
  .lesson {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
    gap: 20px;
    align-items: start;
  }
  .board-wrap {
    max-width: min(100%, 76vh);
    width: 100%;
    margin: 0 auto;
  }
  .end {
    align-items: center;
    text-align: center;
  }
  @media (max-width: 900px) {
    .lesson {
      grid-template-columns: 1fr;
    }
  }
</style>
