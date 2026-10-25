<script lang="ts">
  // One illustration from static/art/manifest.json: alt, intrinsic size, lazy loading and srcset.
  import { art, pathFor, srcsetOf } from './art.ts';

  let {
    name,
    alt,
    decorative = false,
    eager = false,
    sizes,
    size,
    class: cls = '',
    style,
  }: {
    /** Manifest key, e.g. `cards.prsi`. */
    name: string;
    /** Overrides the manifest alt text. */
    alt?: string;
    /** Purely decorative next to a text that says the same: empty alt, hidden from screen readers. */
    decorative?: boolean;
    /** Above the fold (hero): load right away. */
    eager?: boolean;
    /** `sizes` for scenes with variants (default: full width up to the intrinsic size). */
    sizes?: string;
    /** Icons: rendered size in CSS px; picks the smallest variant that is still sharp. */
    size?: number;
    class?: string;
    style?: string;
  } = $props();

  const entry = $derived(art(name));
  const srcset = $derived(entry && size === undefined ? srcsetOf(entry) : undefined);
</script>

{#if entry}
  <img
    class="art {cls}"
    {style}
    src={size !== undefined ? pathFor(entry, size) : entry.path}
    srcset={srcset}
    sizes={srcset ? (sizes ?? `(max-width: ${entry.width}px) 100vw, ${entry.width}px`) : undefined}
    alt={decorative ? '' : (alt ?? entry.alt)}
    aria-hidden={decorative ? 'true' : undefined}
    width={entry.width}
    height={entry.height}
    loading={eager ? 'eager' : 'lazy'}
    decoding="async"
    draggable="false"
  />
{/if}

<style>
  .art {
    display: block;
    max-width: 100%;
    height: auto;
  }
</style>
