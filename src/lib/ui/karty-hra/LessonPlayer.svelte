<script lang="ts">
  // Step-by-step rules guide with the owl. Tasks are checked by the real game rules.
  import {
    LESSONS,
    checkBuildMeld,
    checkChoice,
    checkCount,
    checkLayOffTask,
    checkOpeningTask,
    checkPickCard,
    checkPrsiPick,
    stepText,
    type Audience,
    type TaskCheck,
  } from '#lib/games/karty-hra/learn/lessons.ts';
  import { MARIAS_SUIT_LABELS, type MariasSuit } from '#lib/games/karty-hra/cards.ts';
  import { analyzeMeld, meldValue, MELD_ERROR_TEXT } from '#lib/games/karty-hra/zoliky-melds.ts';
  import Card from './Card.svelte';
  import Hand from './Hand.svelte';
  import Owl from '#lib/ui/art/Owl.svelte';
  import { lessonProgress, saveLessonProgress } from './storage.ts';

  let { game, audience = 'kid' }: { game: 'prsi' | 'zoliky'; audience?: Audience } = $props();

  const lesson = $derived(LESSONS[game]);
  let index = $state(0);
  let feedback: TaskCheck | null = $state(null);
  let solved = $state(false);
  let selected: string[] = $state([]);
  let groups: string[][] = $state([]);

  $effect.pre(() => {
    const saved = lessonProgress(game);
    if (saved > 0 && saved < LESSONS[game].steps.length) index = saved;
  });

  const step = $derived(lesson.steps[index]);
  const task = $derived(step.task);
  const done = $derived(!task || solved);
  const last = $derived(index === lesson.steps.length - 1);
  const grouped = $derived(new Set(groups.flat()));

  function go(to: number) {
    index = Math.max(0, Math.min(lesson.steps.length - 1, to));
    feedback = null;
    solved = false;
    selected = [];
    groups = [];
    saveLessonProgress(game, index);
  }

  function result(r: TaskCheck) {
    if (!r.ok) {
      feedback = r;
      return;
    }
    solved = true;
    const message = task?.type === 'pickPrsi' ? `${step.success ?? ''} ${r.message}`.trim() : (step.success ?? r.message);
    feedback = { ok: true, message };
  }

  function toggle(id: string) {
    if (solved) return;
    selected = selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id];
    feedback = null;
  }

  function tap(id: string) {
    if (!task || solved) return;
    if (task.type === 'pickPrsi') result(checkPrsiPick(task, id));
    else if (task.type === 'layOff') result(checkLayOffTask(task, id));
    else if (task.type === 'pickCard') result(checkPickCard(task, id));
    else toggle(id);
  }

  function addGroup() {
    const check = analyzeMeld(selected);
    if (!check.ok) {
      feedback = { ok: false, message: MELD_ERROR_TEXT[check.error] };
      return;
    }
    groups = [...groups, selected];
    selected = [];
    feedback = null;
  }

  const groupPoints = $derived(
    groups.reduce((sum, g) => {
      const a = analyzeMeld(g);
      return sum + (a.ok ? meldValue(a.shape) : 0);
    }, 0),
  );

  function finish() {
    saveLessonProgress(game, 0);
  }
</script>

<section class="lesson stack" data-testid="lesson" data-step={step.id} data-done={done ? 'true' : 'false'}>
  <div class="progress" aria-label="Postup lekce: krok {index + 1} z {lesson.steps.length}">
    {#each lesson.steps as s, i (s.id)}
      <span class="dot" class:on={i <= index}></span>
    {/each}
  </div>

  <h2>{step.title}</h2>
  <Owl pose={feedback ? (feedback.ok ? 'slavi' : 'premysli') : step.pose} text={feedback ? feedback.message : stepText(step, audience)} />

  {#if step.show}
    <div class="show">
      {#each step.show as id (id)}
        <Card {id} width={78} />
      {/each}
    </div>
  {/if}

  {#if task}
    <div class="task card" data-testid="task" data-type={task.type}>
      {#if task.type === 'pickPrsi'}
        <div class="table-row">
          <div class="pile">
            <Card id={task.top} width={88} />
            <span class="muted small">
              {#if task.pendingSevens}Sedma platí — bereš {task.pendingSevens * 2}{:else if task.pendingAce}Eso platí — stojíš{:else if task.suit}Hraje se: {MARIAS_SUIT_LABELS[task.suit as MariasSuit]}{:else}Karta nahoře{/if}
            </span>
          </div>
        </div>
        <Hand cards={task.hand} onTap={tap} disabled={solved} />
      {:else if task.type === 'choice'}
        <p class="question">{task.question}</p>
        <div class="options">
          {#each task.options as option, i (i)}
            <button type="button" class="btn" data-testid="task-option" disabled={solved} onclick={() => result(checkChoice(task, i))}>{option.text}</button>
          {/each}
        </div>
      {:else if task.type === 'count'}
        <div class="show">
          {#each task.cards as id (id)}<Card {id} width={70} />{/each}
        </div>
        <div class="options">
          {#each task.options as n (n)}
            <button type="button" class="btn" data-testid="task-option" disabled={solved} onclick={() => result(checkCount(task, n))}>{n} bodů</button>
          {/each}
        </div>
      {:else if task.type === 'layOff'}
        <p class="muted">Na stole:</p>
        <div class="show meld">
          {#each task.meld as id (id)}<Card {id} width={64} />{/each}
        </div>
        <Hand cards={task.hand} onTap={tap} disabled={solved} />
      {:else if task.type === 'pickCard'}
        <Hand cards={task.hand} onTap={tap} disabled={solved} />
      {:else if task.type === 'buildMeld'}
        <Hand cards={task.hand} {selected} onTap={tap} disabled={solved} />
        <div class="row">
          <button type="button" class="btn primary" disabled={solved || selected.length < 3} onclick={() => result(checkBuildMeld(task, selected))}>Hotovo</button>
          <button type="button" class="btn ghost" disabled={solved || selected.length === 0} onclick={() => ((selected = []), (feedback = null))}>Zrušit výběr</button>
        </div>
      {:else if task.type === 'opening'}
        <Hand cards={task.hand.filter((c) => !grouped.has(c))} {selected} onTap={tap} disabled={solved} />
        <div class="groups">
          {#each groups as g, i (i)}
            <div class="show meld">{#each g as id (id)}<Card {id} width={54} />{/each}</div>
          {/each}
        </div>
        <p class="counter" data-testid="opening-points">Body k prvnímu vyložení: <strong>{groupPoints}</strong> / {task.min}</p>
        <div class="row">
          <button type="button" class="btn" disabled={solved || selected.length < 3} onclick={addGroup}>Přidat skupinu</button>
          <button type="button" class="btn primary" disabled={solved || groups.length === 0} onclick={() => result(checkOpeningTask(task, groups))}>Vyložit</button>
          <button type="button" class="btn ghost" disabled={solved} onclick={() => ((groups = []), (selected = []), (feedback = null))}>Začít znovu</button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="row nav">
    <button type="button" class="btn ghost" disabled={index === 0} onclick={() => go(index - 1)}>Zpět</button>
    {#if last}
      <a class="btn primary big" href="/trenink/{game}" onclick={finish} data-testid="lesson-finish">Hrát s počítačem</a>
    {:else}
      <button type="button" class="btn primary big" data-testid="lesson-next" disabled={!done} onclick={() => go(index + 1)}>Dál</button>
    {/if}
  </div>
</section>

<style>
  .progress {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--line);
  }
  .dot.on {
    background: var(--sage-dark);
  }
  .show {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .meld {
    gap: 2px;
  }
  .task {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: stretch;
  }
  .table-row {
    display: flex;
    justify-content: center;
  }
  .pile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .small {
    font-size: 0.95rem;
  }
  .question {
    font-weight: 700;
    margin: 0;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .groups {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    justify-content: center;
  }
  .counter {
    margin: 0;
    text-align: center;
    font-size: 1.15rem;
  }
  .nav {
    justify-content: space-between;
  }
</style>
