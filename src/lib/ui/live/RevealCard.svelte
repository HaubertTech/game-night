<script lang="ts">
  import type { ContestantView, RevealedAnswer } from '../../live/protocol.ts';
  import { LEVEL_LABELS } from '../../types.ts';
  import { LEVEL_EMOJI, pointsLabel } from '../labels.ts';
  import { correctAnswerText, givenText, revealTitle } from './view-helpers.ts';

  let {
    reveal,
    contestant,
    onJudge,
    showQuestion = true,
    mine = false,
  }: {
    reveal: RevealedAnswer;
    contestant: ContestantView | undefined;
    onJudge?: (correct: boolean) => void;
    showQuestion?: boolean;
    mine?: boolean;
  } = $props();
  const q = $derived(reveal.question);
  const state = $derived(reveal.awaitingJudge ? 'pending' : reveal.correct ? 'ok' : 'bad');
</script>

<article class="reveal card {state}" class:mine data-testid="reveal-card" data-contestant={reveal.contestantId} data-state={state}>
  <header>
    {#if contestant}
      <span class="emoji avatar">{contestant.avatar}</span>
      <span class="name">{contestant.name}</span>
      <span class="badge {contestant.level}">{LEVEL_EMOJI[contestant.level]} {LEVEL_LABELS[contestant.level]}</span>
    {/if}
    <span class="verdict">{revealTitle(reveal)}</span>
  </header>
  {#if showQuestion}<p class="question">{q.image ? `${q.image} ` : ''}{q.text}</p>{/if}
  <dl>
    <div>
      <dt>Odpověď</dt>
      <dd data-testid="given">{givenText(q, reveal.given)}</dd>
    </div>
    <div>
      <dt>Správně</dt>
      <dd class="correct">{correctAnswerText(q)}{#if q.type === 'open' && q.accept?.length}<span class="muted"> (platí i {q.accept.join(', ')})</span>{/if}</dd>
    </div>
  </dl>
  <p class="points">
    {reveal.points > 0 ? `+${pointsLabel(reveal.points)}` : '0 bodů'}{reveal.joker ? ' · 🃏 žolík ×2' : ''}
  </p>
  {#if reveal.awaitingJudge && onJudge}
    <div class="judge row">
      <button class="btn primary" onclick={() => onJudge(true)} aria-label={`Uznat odpověď: ${contestant?.name ?? ''}`}>✓ Správně</button>
      <button class="btn" onclick={() => onJudge(false)} aria-label={`Neuznat odpověď: ${contestant?.name ?? ''}`}>✗ Špatně</button>
    </div>
  {/if}
  {#if q.fact}<p class="fact" data-testid="fact">💡 {q.fact}</p>{/if}
</article>

<style>
  .reveal {
    display: flex;
    flex-direction: column;
    gap: 10px;
    text-align: left;
    border-width: 3px;
  }
  .ok {
    border-color: var(--sage);
  }
  .bad {
    border-color: var(--bad);
  }
  .pending {
    border-color: var(--clay);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .avatar {
    font-size: 2rem;
  }
  .name {
    font-weight: 800;
    font-size: 1.3rem;
  }
  .verdict {
    margin-left: auto;
    font-weight: 800;
    font-size: 1.2rem;
  }
  .question {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 650;
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  dt {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  dd {
    margin: 0;
    font-weight: 750;
    font-size: 1.2rem;
  }
  .correct {
    color: var(--good);
  }
  .points {
    margin: 0;
    font-weight: 800;
  }
  .fact {
    margin: 0;
    padding: 12px 16px;
    background: var(--sage-light);
    border-radius: var(--radius-sm);
    font-size: 1.25rem;
    line-height: 1.45;
  }
  .judge .btn {
    flex: 1;
  }
</style>
