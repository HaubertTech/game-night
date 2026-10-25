<script lang="ts">
  import ArtIcon from '#lib/ui/live/ArtIcon.svelte';
  import { THEME_ART } from '#lib/ui/art/art.ts';
  import type { PublicQuestion } from '../../live/protocol.ts';
  import { LEVEL_LABELS, LEVEL_READER, THEME_LABELS, isChildLevel } from '../../types.ts';
  import { IMITATE_DONE, IMITATE_FAILED } from '../../engine/live.ts';
  import { LEVEL_EMOJI } from '../labels.ts';
  import Pic from '../art/Pic.svelte';
  import QuestionImage from '../QuestionImage.svelte';
  import { splitEmoji } from './view-helpers.ts';

  let {
    question,
    onAnswer,
    onSpeak,
    size = 'phone',
    disabled = false,
    maxLength = 200,
  }: {
    question: PublicQuestion;
    onAnswer: (value: string | number) => void;
    onSpeak?: () => void;
    size?: 'phone' | 'tv';
    disabled?: boolean;
    maxLength?: number;
  } = $props();

  let estimate = $state('');
  let open = $state('');
  const kids = $derived(isChildLevel(question.level));
  /** Kocarek: a parent (or the host) reads the question and confirms an imitation. */
  const parentLed = $derived(LEVEL_READER[question.level] === 'parent');
  const options = $derived(question.options ?? []);
  const parsed = $derived(Number(estimate.replace(/\s/g, '').replace(',', '.')));
  const estimateValid = $derived(estimate.trim() !== '' && Number.isFinite(parsed));

  function submitEstimate(e: SubmitEvent) {
    e.preventDefault();
    if (estimateValid && !disabled) onAnswer(parsed);
  }
  function submitOpen(e: SubmitEvent) {
    e.preventDefault();
    if (open.trim() && !disabled) onAnswer(open.trim());
  }
</script>

<article class="q {size}" class:kids data-testid="live-question" data-type={question.type} data-level={question.level}>
  {#if question.fallback}<p class="mix">{LEVEL_EMOJI[question.level]} Mix {LEVEL_LABELS[question.level]} · <ArtIcon name={THEME_ART[question.theme]} /> {THEME_LABELS[question.theme]}</p>{/if}
  {#if question.image}<QuestionImage image={question.image} big={kids} />{/if}
  {#if parentLed}<p class="read-to" data-testid="read-to">📖 Přečti dítěti:</p>{/if}
  <h2 class="text">{question.text}</h2>
  {#if onSpeak}
    <button class="btn small ghost speak" type="button" onclick={onSpeak}>🔊 Přečíst</button>
  {/if}

  {#if question.type === 'imitate'}
    <div class="model card" data-testid="model-answer">
      <span class="muted">Vzor pro rodiče</span>
      <strong>{question.model}</strong>
    </div>
    <div class="row judge">
      <button class="btn primary big" data-testid="imitate-yes" {disabled} onclick={() => onAnswer(IMITATE_DONE)}>Zvládl/a ✓</button>
      <button class="btn big" data-testid="imitate-no" {disabled} onclick={() => onAnswer(IMITATE_FAILED)}>Zkusíme jinou ✗</button>
    </div>
  {:else if question.options}
    <div class="options" class:two={options.length === 2}>
      {#each options as option (option)}
        {#if kids}
          {@const [pic, label] = splitEmoji(option)}
          <button class="option tile" data-testid="option" {disabled} onclick={() => onAnswer(option)} aria-label={label}>
            <Pic emoji={pic} size={size === 'tv' ? 176 : 88} decorative class="pic" />
            <span class="label">{label}</span>
          </button>
        {:else}
          <button class="option" data-testid="option" {disabled} onclick={() => onAnswer(option)}>{option}</button>
        {/if}
      {/each}
    </div>
  {:else if question.type === 'estimate'}
    <form class="entry" onsubmit={submitEstimate}>
      <label class="visually-hidden" for="live-estimate">Tvůj odhad</label>
      <input
        id="live-estimate"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        placeholder="Tvůj odhad"
        bind:value={estimate}
        data-testid="estimate-input"
      />
      {#if question.unit}<span class="unit">{question.unit}</span>{/if}
      <button class="btn primary big" type="submit" disabled={!estimateValid || disabled}>Odpovědět</button>
    </form>
  {:else}
    <form class="entry" onsubmit={submitOpen}>
      <label class="visually-hidden" for="live-open">Tvoje odpověď</label>
      <input
        id="live-open"
        type="text"
        autocomplete="off"
        autocapitalize="sentences"
        placeholder="Napiš odpověď"
        maxlength={maxLength}
        bind:value={open}
        data-testid="open-input"
      />
      <button class="btn primary big" type="submit" disabled={!open.trim() || disabled}>Odpovědět</button>
    </form>
    <p class="muted hint">Odpověď posoudí hostitel na televizi.</p>
  {/if}
</article>

<style>
  .q {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
    width: 100%;
  }
  .read-to {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--ink-soft);
  }
  .model {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: min(100%, 360px);
  }
  .model strong {
    font-size: 2rem;
  }
  .judge {
    justify-content: center;
  }
  .mix {
    margin: 0;
    padding: 4px 14px;
    border-radius: 999px;
    background: var(--sage-light);
    font-weight: 700;
  }
  .q :global(.image.emoji) {
    font-size: 4rem;
  }
  .kids :global(.image.emoji) {
    font-size: 5.5rem;
  }
  .text {
    margin: 0;
    font-size: 1.6rem;
    max-width: 32ch;
  }
  .tv .text {
    font-size: clamp(2.2rem, 4vw, 3.6rem);
  }
  .tv :global(.image.emoji) {
    font-size: 8rem;
  }
  .options {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .tv .options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .kids .options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tv.kids .options {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .option {
    min-height: 76px;
    padding: 14px 18px;
    border: 2px solid var(--ink);
    border-radius: var(--radius-sm);
    background: var(--paper);
    box-shadow: 0 3px 0 var(--ink);
    font-size: 1.35rem;
    font-weight: 700;
  }
  .tv .option {
    min-height: 110px;
    font-size: 2rem;
  }
  .option:active {
    transform: translateY(2px);
    box-shadow: 0 1px 0 var(--ink);
  }
  .option:disabled {
    opacity: 0.5;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 170px;
    background: var(--paper);
  }
  .tv .tile {
    min-height: 260px;
  }
  .label {
    font-size: 1.3rem;
  }
  .tv .label {
    font-size: 2rem;
  }
  .entry {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: center;
    width: 100%;
  }
  .entry input {
    flex: 1 1 220px;
    font-size: 1.8rem;
    text-align: center;
    min-height: 72px;
  }
  .unit {
    font-size: 1.3rem;
    font-weight: 700;
  }
  .entry .btn {
    flex: 1 1 100%;
  }
  .hint {
    margin: 0;
  }
</style>
