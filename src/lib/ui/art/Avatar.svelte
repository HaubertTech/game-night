<script lang="ts">
  // Player or team avatar: an illustrated animal (`art:liska`) or an emoji (older data, teams).
  import { avatarArt, avatarName, pathFor } from './art.ts';

  let {
    value,
    fallback = '🙂',
    label = false,
    px = 64,
  }: {
    value: string | null | undefined;
    fallback?: string;
    /** Announce the animal to screen readers (pickers); next to a name it stays decorative. */
    label?: boolean;
    /** Rendered size in CSS px, picks a sharp enough file (TV and „huge“ avatars pass more). */
    px?: number;
  } = $props();

  const entry = $derived(avatarArt(value));
</script>

{#if entry}
  <img
    class="avatar-img"
    src={pathFor(entry, px)}
    alt={label ? (avatarName(value) ?? '') : ''}
    aria-hidden={label ? undefined : 'true'}
    width="128"
    height="128"
    loading="lazy"
    decoding="async"
    draggable="false"
  />
{:else}
  <span class="emoji avatar-emoji" aria-hidden={label ? undefined : 'true'}>{value || fallback}</span>
{/if}

<style>
  /* Sized like the emoji it replaces: the parent's font-size decides. */
  .avatar-img {
    display: inline-block;
    width: 1.25em;
    height: 1.25em;
    object-fit: contain;
    vertical-align: middle;
  }
  .avatar-emoji {
    font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
    line-height: 1;
  }
</style>
