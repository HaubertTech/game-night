<script lang="ts">
  import LearnerBar from '#lib/ui/chess/LearnerBar.svelte';
  import Owl from '#lib/ui/art/Owl.svelte';
  import type { Learner } from '#lib/ui/chess/storage.ts';
  import { LESSONS } from '#lib/games/chess/learn/data.ts';
  import { lessonDone, loadProgress } from '#lib/games/chess/learn/lessons.ts';

  let learner = $state<Learner | null>(null);
  const progress = $derived(learner ? loadProgress(learner.id) : { steps: {}, puzzles: [] });
  const done = $derived(LESSONS.map((l) => lessonDone(progress, l)));
  const nextIndex = $derived(LESSONS.findIndex((l, i) => done[i] < l.steps.length));
  const finishedCount = $derived(LESSONS.filter((l, i) => done[i] === l.steps.length).length);
</script>

<svelte:head><title>Učení šachů · Herní večer</title></svelte:head>

<main class="page stack">
  <a href="/sachy" class="btn small ghost back">← Šachy</a>
  <h1>🎓 Učíme se šachy</h1>
  <LearnerBar bind:learner />
  <Owl
    mood={finishedCount === LESSONS.length ? 'slavi' : 'mava'}
    text={finishedCount === LESSONS.length
      ? 'Všechny lekce jsou hotové! Teď si zkus úlohy nebo partii s počítačem.'
      : nextIndex >= 0
        ? `Pojď na to! Další lekce: ${LESSONS[nextIndex].title}.`
        : 'Vyber si lekci.'}
  />

  <ol class="map" aria-label="Mapa lekcí">
    {#each LESSONS as lesson, i (lesson.id)}
      <li class:next={i === nextIndex} class:done={done[i] === lesson.steps.length}>
        <a class="card lesson" href={`/sachy/uceni/${lesson.id}`} data-testid={`lesson-${lesson.id}`}>
          <span class="num">{i + 1}</span>
          <span class="icon" aria-hidden="true">{lesson.icon}</span>
          <strong>{lesson.title}</strong>
          <span class="muted">{done[i] === lesson.steps.length ? '✓ hotovo' : `${done[i]} / ${lesson.steps.length}`}</span>
        </a>
      </li>
    {/each}
  </ol>
  <a class="btn" href="/sachy/ulohy">🧩 Úlohy na procvičení</a>
</main>

<style>
  .back {
    align-self: flex-start;
  }
  .map {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 14px;
  }
  .lesson {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-decoration: none;
    color: inherit;
    padding: 16px 10px;
    min-height: 150px;
    text-align: center;
  }
  .icon {
    font-size: 2.4rem;
  }
  .num {
    position: absolute;
    top: 8px;
    left: 12px;
    font-weight: 800;
    color: var(--ink-soft);
  }
  .done .lesson {
    background: var(--sage-light);
    border-color: var(--sage);
  }
  .next .lesson {
    border-color: var(--clay);
    box-shadow: 0 4px 0 var(--clay-dark);
  }
</style>
