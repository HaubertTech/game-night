<script lang="ts">
  // Game tile with its illustration: the home page, the TV game choice and the evening page.
  import type { Snippet } from 'svelte';
  import Art from './Art.svelte';
  import { art as artEntry } from './art.ts';

  let {
    art: artName,
    title,
    text,
    href,
    onclick,
    disabled = false,
    pressed,
    testid,
    small = false,
    children,
  }: {
    /** Manifest key of the illustration. */
    art: string;
    title: string;
    text?: string;
    href?: string;
    onclick?: () => void;
    disabled?: boolean;
    /** Selection (TV game choice): renders aria-pressed. */
    pressed?: boolean;
    testid?: string;
    /** Smaller tiles (evening page, phone). */
    small?: boolean;
    /** Extra line under the text (badges, „bez účtu“). */
    children?: Snippet;
  } = $props();

  // Transparent pictures (the owl standing in for chess) are shown whole on the tinted background.
  const icon = $derived(artEntry(artName)?.transparent ?? false);
  const sizes = $derived(small ? '(max-width: 700px) 50vw, 240px' : '(max-width: 700px) 100vw, 360px');
</script>

{#snippet body()}
  <span class="pic" class:icon><Art name={artName} decorative {sizes} /></span>
  <span class="txt">
    <strong>{title}</strong>
    {#if text}<span class="muted">{text}</span>{/if}
    {#if children}{@render children()}{/if}
  </span>
{/snippet}

{#if href && !disabled}
  <a class="game-card" class:small {href} data-testid={testid}>{@render body()}</a>
{:else}
  <button type="button" class="game-card" class:small {onclick} {disabled} aria-pressed={pressed} data-testid={testid}>{@render body()}</button>
{/if}

<style>
  .game-card {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0;
    border: 2px solid var(--line);
    border-radius: var(--radius);
    background: var(--paper);
    box-shadow: var(--shadow);
    color: var(--ink);
    text-decoration: none;
    text-align: left;
    font: inherit;
    transition: transform 80ms ease;
  }
  .game-card:active:not(:disabled) {
    transform: translateY(2px);
  }
  .game-card:focus-visible {
    outline: 3px solid var(--slate);
    outline-offset: 2px;
  }
  .game-card[aria-pressed='true'] {
    border-color: var(--sage-dark);
    box-shadow: 0 0 0 3px var(--sage-light), var(--shadow);
  }
  .game-card:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .pic {
    display: block;
    aspect-ratio: 4 / 3;
    background: var(--sage-light);
    overflow: hidden;
  }
  .pic :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pic.icon :global(img) {
    object-fit: contain;
    padding: 8px;
  }
  .txt {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px 16px;
  }
  .txt strong {
    font-size: 1.25rem;
    font-weight: 800;
  }
  .txt .muted {
    font-size: 0.98rem;
  }
  .small .pic {
    aspect-ratio: 16 / 9;
  }
  .small .txt {
    padding: 10px 12px 12px;
  }
  .small .txt strong {
    font-size: 1.1rem;
  }
</style>
