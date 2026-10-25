<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ANSWER_MAX, type MjzCategory } from '../../games/mjz/engine.ts';

  let {
    categories,
    sheet,
    letter,
    name = '',
    onWrite,
    onStop,
    onDone,
  }: {
    categories: MjzCategory[];
    /** Answers as the server has them (initial values; local typing wins afterwards). */
    sheet: Record<string, string>;
    letter: string | null;
    /** Whose sheet (host writing for a preschooler). */
    name?: string;
    onWrite: (answers: Record<string, string>) => void;
    onStop?: () => void;
    onDone: () => void;
  } = $props();

  const DEBOUNCE_MS = 300;
  // svelte-ignore state_referenced_locally
  let draft = $state<Record<string, string>>({ ...sheet });
  let dirty: Record<string, string> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const filled = $derived(categories.every((c) => (draft[c.id] ?? '').trim() !== ''));

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (Object.keys(dirty).length === 0) return;
    const answers = dirty;
    dirty = {};
    onWrite(answers);
  }

  function input(id: string, value: string) {
    draft = { ...draft, [id]: value };
    dirty = { ...dirty, [id]: value };
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  }

  onDestroy(flush);
</script>

<form class="sheet stack" data-testid="mjz-sheet" onsubmit={(e) => e.preventDefault()}>
  {#each categories as c (c.id)}
    <label class="field">
      <span>{c.label}{#if name} · {name}{/if}</span>
      <input
        type="text"
        value={draft[c.id] ?? ''}
        oninput={(e) => input(c.id, e.currentTarget.value)}
        onblur={flush}
        maxlength={ANSWER_MAX}
        autocapitalize="words"
        autocomplete="off"
        spellcheck="false"
        autocorrect="off"
        placeholder={letter ? `${letter}…` : ''}
        data-category={c.id}
        aria-label={name ? `${c.label} za ${name}` : c.label}
      />
    </label>
  {/each}
  <div class="buttons">
    {#if onStop}
      <button type="button" class="btn clay big" disabled={!filled} onclick={() => (flush(), onStop?.())}>🛑 Stop!</button>
    {/if}
    <button type="button" class="btn primary big" onclick={() => (flush(), onDone())}>✅ Hotovo</button>
  </div>
  {#if onStop && !filled}<p class="muted hint">Stop! jde zmáčknout, až máš vyplněné všechno.</p>{/if}
</form>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 750;
  }
  .buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .buttons :global(.btn) {
    width: 100%;
  }
  .hint {
    margin: 0;
    font-size: 0.95rem;
  }
</style>
