<script lang="ts">
  // Picture for children's questions: an illustration from static/art/pics when the emoji (or key)
  // has one, otherwise the emoji itself. Same box size either way, so layouts do not jump.
  import { pathFor, picArt, picKeyFor } from './art.ts';

  let {
    emoji = '',
    key,
    size = 96,
    alt,
    decorative = false,
    class: cls = '',
  }: {
    /** Emoji from the question data (`🐐`); mapped through static/art/pics-emoji.json. */
    emoji?: string;
    /** Explicit picture key (`koza`); wins over the emoji. */
    key?: string;
    /** Rendered square size in CSS px. */
    size?: number;
    /** Czech alt text; defaults to the picture name („Koza“). */
    alt?: string;
    /** Next to a text that says the same (answer label): hidden from screen readers. */
    decorative?: boolean;
    class?: string;
  } = $props();

  const entry = $derived(picArt(key ?? picKeyFor(emoji)));
  const label = $derived(alt ?? entry?.alt ?? '');
</script>

{#if entry}
  <img
    class="pic {cls}"
    src={pathFor(entry, size)}
    alt={decorative ? '' : label}
    aria-hidden={decorative ? 'true' : undefined}
    width={size}
    height={size}
    style:width="{size}px"
    style:height="{size}px"
    loading="lazy"
    decoding="async"
    draggable="false"
  />
{:else if emoji}
  <span
    class="pic pic-emoji emoji {cls}"
    style:width="{size}px"
    style:height="{size}px"
    style:font-size="{Math.round(size * 0.78)}px"
    role={decorative || !label ? undefined : 'img'}
    aria-label={decorative || !label ? undefined : label}
    aria-hidden={decorative ? 'true' : undefined}>{emoji}</span
  >
{/if}

<style>
  .pic {
    display: inline-block;
    flex: none;
    object-fit: contain;
    vertical-align: middle;
    user-select: none;
    -webkit-user-select: none;
  }
  .pic-emoji {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
</style>
