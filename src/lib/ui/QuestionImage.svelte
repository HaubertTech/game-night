<script lang="ts">
  // Picture above a question: an illustration when `image` is a manifest key (e.g. `questions.koza`),
  // otherwise the emoji from the dataset. Big for children who do not read yet.
  import Art from './art/Art.svelte';
  import { art } from './art/art.ts';

  let { image, big = false }: { image: string; big?: boolean } = $props();

  const entry = $derived(art(image));
</script>

{#if entry}
  <div class="image art-image" class:big data-testid="question-image">
    <Art name={image} decorative />
  </div>
{:else}
  <div class="image emoji" class:big aria-hidden="true" data-testid="question-image">{image}</div>
{/if}

<style>
  .image {
    font-size: 5rem;
    line-height: 1.1;
  }
  .image.big {
    font-size: 7rem;
  }
  .art-image {
    width: min(60vw, 220px);
  }
  .art-image.big {
    width: min(70vw, 320px);
  }
  .art-image :global(img) {
    width: 100%;
    height: auto;
  }
</style>
