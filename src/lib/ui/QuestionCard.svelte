<script lang="ts">
  import type { Question } from '../types.ts';
  import type { Turn } from '../engine/select.ts';
  import { isSpeechSupported } from '../tts.ts';

  let {
    question,
    turn,
    phase,
    onAnswer,
    onReveal,
    onJudge,
    onSpeak,
  }: {
    question: Question;
    turn: Turn;
    phase: 'question' | 'judge';
    onAnswer: (value: string | number) => void;
    onReveal: () => void;
    onJudge: (correct: boolean) => void;
    onSpeak: () => void;
  } = $props();

  let estimate = $state('');
  const kids = $derived(question.level === 'piskoviste');
  const options = $derived(question.type === 'choice' ? (turn.options ?? question.options) : []);
  const parsedEstimate = $derived(Number(estimate.replace(/\s/g, '').replace(',', '.')));
  const estimateValid = $derived(estimate.trim() !== '' && Number.isFinite(parsedEstimate));

  function submitEstimate(event: SubmitEvent) {
    event.preventDefault();
    if (estimateValid) onAnswer(parsedEstimate);
  }

  /** "🦔 Ježek" → ["🦔", "Ježek"] for big picture tiles. */
  function splitEmoji(option: string): [string, string] {
    const m = option.match(/^(\S+)\s+(.*)$/u);
    return m ? [m[1], m[2]] : ['', option];
  }
</script>

<article class="question" class:kids data-testid="question" data-type={question.type}>
  {#if question.image}
    <div class="image emoji" aria-hidden="true">{question.image}</div>
  {/if}
  <h2 class="text">{question.text}</h2>
  {#if kids || isSpeechSupported()}
    <div class="speak">
      <button class="btn small ghost" onclick={onSpeak}>🔊 Zopakuj</button>
    </div>
  {/if}

  {#if question.type === 'choice'}
    <div class="options" class:two={options.length === 2}>
      {#each options as option (option)}
        {#if kids}
          {@const [pic, label] = splitEmoji(option)}
          <button class="option tile" data-testid="option" onclick={() => onAnswer(option)}>
            <span class="emoji pic">{pic}</span>
            <span class="label">{label}</span>
          </button>
        {:else}
          <button class="option" data-testid="option" onclick={() => onAnswer(option)}>{option}</button>
        {/if}
      {/each}
    </div>
  {:else if question.type === 'estimate'}
    <form class="estimate" onsubmit={submitEstimate}>
      <label class="visually-hidden" for="estimate">Tvůj odhad</label>
      <input
        id="estimate"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        autocomplete="off"
        placeholder="Tvůj odhad"
        bind:value={estimate}
        data-testid="estimate-input"
      />
      <span class="unit">{question.unit}</span>
      <button class="btn primary big" type="submit" disabled={!estimateValid}>Odpovědět</button>
    </form>
    <p class="muted hint">
      {#if question.unit.trim().toLowerCase() === 'rok' || question.tolerance}
        1 bod, když se trefíš do ±{question.tolerance?.partial ?? 10} {question.unit === 'rok' ? 'let' : question.unit}.
      {:else}
        1 bod, když se trefíš do 25 % od správné hodnoty.
      {/if}
    </p>
  {:else if phase === 'question'}
    <p class="muted hint">Řekni odpověď nahlas, pak ji ukaž ostatním.</p>
    <button class="btn clay big" onclick={onReveal}>👀 Ukázat odpověď</button>
  {:else}
    <div class="reveal card">
      <span class="muted">Správná odpověď</span>
      <strong class="answer">{question.answer}</strong>
      {#if question.accept?.length}<span class="muted">Platí i: {question.accept.join(', ')}</span>{/if}
    </div>
    <p class="judge-q">Ostatní hráči: řekl(a) to správně?</p>
    <div class="row judge">
      <button class="btn primary big" onclick={() => onJudge(true)}>✓ Ano, správně</button>
      <button class="btn big" onclick={() => onJudge(false)}>✗ Ne</button>
    </div>
  {/if}
</article>

<style>
  .question {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    text-align: center;
  }
  .image {
    font-size: 5rem;
  }
  .kids .image {
    font-size: 7rem;
  }
  .text {
    font-size: clamp(1.6rem, 3.4vw, 2.3rem);
    max-width: 32ch;
    margin: 0;
  }
  .kids .text {
    font-size: clamp(2rem, 4.5vw, 2.8rem);
  }
  .options {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .option {
    min-height: 92px;
    padding: 14px 18px;
    border: 2px solid var(--ink);
    border-radius: var(--radius-sm);
    background: var(--paper);
    box-shadow: 0 3px 0 var(--ink);
    font-size: 1.35rem;
    font-weight: 700;
  }
  .option:active {
    transform: translateY(2px);
    box-shadow: 0 1px 0 var(--ink);
  }
  .options:not(.two) .tile {
    min-height: 200px;
  }
  .kids .options {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 240px;
    background: var(--paper);
  }
  .pic {
    font-size: 6rem;
  }
  .label {
    font-size: 1.5rem;
  }
  .estimate {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    justify-content: center;
    width: 100%;
  }
  .estimate input {
    width: min(100%, 300px);
    font-size: 2rem;
    text-align: center;
    min-height: 76px;
  }
  .unit {
    font-size: 1.4rem;
    font-weight: 700;
  }
  .hint {
    margin: 0;
  }
  .reveal {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: min(100%, 420px);
  }
  .answer {
    font-size: 2rem;
  }
  .judge-q {
    font-size: 1.3rem;
    font-weight: 700;
    margin: 0;
  }
  .judge {
    justify-content: center;
  }
  @media (orientation: portrait) and (max-width: 700px) {
    .options:not(.two) {
      grid-template-columns: 1fr;
    }
    .kids .options {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
