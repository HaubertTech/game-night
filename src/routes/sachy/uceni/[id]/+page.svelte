<script lang="ts">
  import { page } from '$app/state';
  import Board from '#lib/ui/chess/Board.svelte';
  import Owl from '#lib/ui/art/Owl.svelte';
  import { loadLearner } from '#lib/ui/chess/storage.ts';
  import { LESSONS, lessonById } from '#lib/games/chess/learn/data.ts';
  import { applyStepMove, loadProgress, markStep, saveProgress, startStep, stepMoves, type StepState } from '#lib/games/chess/learn/lessons.ts';
  import { checkSquare } from '#lib/games/chess/engine.ts';

  const lesson = $derived(lessonById(page.params.id ?? ''));
  const nextLesson = $derived.by(() => {
    const i = LESSONS.findIndex((l) => l.id === lesson?.id);
    return i >= 0 ? LESSONS[i + 1] : undefined;
  });

  let stepIndex = $state(0);
  let stepState = $state<StepState | null>(null);
  let message = $state<{ text: string; mood: 'mava' | 'otazka' | 'slavi' | 'premysli' } | null>(null);
  let intro = $state(true);

  const step = $derived(lesson?.steps[stepIndex]);

  $effect(() => {
    // New lesson (navigation between lessons reuses this component).
    void lesson?.id;
    stepIndex = 0;
    intro = true;
    message = null;
  });

  $effect(() => {
    if (step) {
      stepState = startStep(step);
      message = null;
    }
  });

  const legal = $derived(stepState ? stepMoves(stepState) : []);
  const check = $derived.by(() => {
    if (!stepState) return null;
    try {
      return checkSquare(stepState.fen);
    } catch {
      return null;
    }
  });

  function onmove(uci: string) {
    if (!step || !stepState) return;
    const r = applyStepMove(step, stepState, uci);
    if (!r.ok) {
      message = { text: r.message, mood: 'premysli' };
      return;
    }
    stepState = r.state;
    if (r.state.done) {
      const learner = loadLearner();
      saveProgress(learner.id, markStep(loadProgress(learner.id), lesson!.id, step.id));
      message = { text: r.message ?? step.praise, mood: 'slavi' };
    } else if (r.message) message = { text: r.message, mood: 'mava' };
  }

  function restart() {
    if (step) stepState = startStep(step);
    message = null;
  }
</script>

<svelte:head><title>{lesson?.title ?? 'Lekce'} – učení šachů · Herní večer</title></svelte:head>

<main class="page stack">
  <a href="/sachy/uceni" class="btn small ghost back">← Mapa lekcí</a>
  {#if !lesson}
    <Owl mood="premysli" text="Tuhle lekci neznám. Vyber si jinou na mapě lekcí." />
  {:else}
    <h1>{lesson.icon} {lesson.title}</h1>
    {#if intro}
      <Owl mood="mava" text={lesson.intro}>
        <button type="button" class="btn primary" onclick={() => (intro = false)}>Jdeme na to!</button>
      </Owl>
    {:else if step && stepState}
      <div class="lesson-layout" data-testid="lesson" data-step={step.id} data-done={stepState.done}>
        <div class="board-col">
          <Board fen={stepState.fen} {legal} interactive={!stepState.done} stars={stepState.left.filter(() => step.goal.type === 'stars')} lastMove={stepState.lastMove} {check} {onmove} />
        </div>
        <aside class="stack side">
          <p class="muted">Krok {stepIndex + 1} z {lesson.steps.length}</p>
          <p class="task" data-testid="lesson-task">{step.text}</p>
          {#if message}
            <Owl mood={message.mood} text={message.text} compact />
          {/if}
          {#if stepState.done}
            {#if stepIndex + 1 < lesson.steps.length}
              <button type="button" class="btn big primary" onclick={() => stepIndex++}>Další krok →</button>
            {:else}
              <div data-testid="lesson-finished">
                <Owl mood="slavi" text="Lekce je hotová. Výborně!">
                  {#if nextLesson}<a class="btn primary" href={`/sachy/uceni/${nextLesson.id}`}>Další lekce: {nextLesson.title}</a>{/if}
                  <a class="btn" href="/sachy/uceni">Mapa lekcí</a>
                </Owl>
              </div>
            {/if}
          {:else}
            <div class="row">
              <button type="button" class="btn" onclick={() => step && (message = { text: step.hint, mood: 'otazka' })}>💡 Nápověda</button>
              <button type="button" class="btn" onclick={restart}>↺ Znovu</button>
            </div>
          {/if}
        </aside>
      </div>
    {/if}
  {/if}
</main>

<style>
  .back {
    align-self: flex-start;
  }
  .lesson-layout {
    display: grid;
    gap: 18px;
  }
  .board-col {
    width: min(100%, calc(100dvh - 320px));
    min-width: min(100%, 300px);
    margin: 0 auto;
  }
  @media (orientation: landscape) and (min-width: 820px) {
    .lesson-layout {
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
