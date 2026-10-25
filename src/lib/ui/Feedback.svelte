<script lang="ts">
  import type { Question } from '../types.ts';
  import type { AnswerRecord } from '../engine/quiz.ts';
  import { deviationLabel, formatEstimate, pointsLabel } from './labels.ts';

  let { question, answer, nextLabel, onNext }: { question: Question; answer: AnswerRecord; nextLabel: string; onNext: () => void } =
    $props();

  const title = $derived(
    answer.timedOut ? '⏰ Čas vypršel' : answer.correct ? (answer.basePoints === 2 ? '🎯 Výborný odhad!' : '✅ Správně!') : '🙈 Tentokrát ne',
  );
</script>

<article class="feedback" class:ok={answer.correct} data-testid="feedback">
  <h2>{title}</h2>
  <p class="points">{answer.points > 0 ? `+${pointsLabel(answer.points)}` : '0 bodů'}{answer.points > answer.basePoints ? ' (🃏 žolík)' : ''}</p>

  <div class="card answer">
    <span class="muted">Správná odpověď</span>
    {#if question.type === 'estimate'}
      <strong>{formatEstimate(question.answer, question.unit)} {question.unit === 'rok' ? '' : question.unit}</strong>
      {#if typeof answer.given === 'number'}
        <span>Tvůj odhad: {formatEstimate(answer.given, question.unit)} {question.unit === 'rok' ? '' : question.unit}
          ({deviationLabel(question, answer.given, question.answer)})</span>
      {/if}
    {:else}
      <strong>{question.answer}</strong>
      {#if question.type === 'choice' && answer.given && !answer.correct}
        <span>Tvoje odpověď: {answer.given}</span>
      {/if}
    {/if}
  </div>

  {#if question.fact}
    <p class="fact">💡 {question.fact}</p>
  {/if}

  <button class="btn primary big" onclick={onNext}>{nextLabel} ➜</button>
</article>

<style>
  .feedback {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
  }
  h2 {
    font-size: 2.4rem;
    margin: 0;
    color: var(--bad);
  }
  .ok h2 {
    color: var(--good);
  }
  .points {
    font-size: 1.4rem;
    font-weight: 800;
    margin: 0;
  }
  .answer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: min(100%, 460px);
  }
  .answer strong {
    font-size: 1.8rem;
  }
  .fact {
    max-width: 44ch;
    font-size: 1.2rem;
    margin: 0;
    padding: 12px 18px;
    background: var(--sage-light);
    border-radius: var(--radius-sm);
  }
</style>
