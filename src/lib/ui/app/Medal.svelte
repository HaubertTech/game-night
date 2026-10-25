<script lang="ts">
  // Place in standings: medal picture for 1–3, „4.“ text otherwise, „–“ without a place.
  import Art from '#lib/ui/art/Art.svelte';
  import { medalArt } from '#lib/ui/art/art.ts';

  let { place, size = 28 }: { place: number | null | undefined; size?: number } = $props();

  const name = $derived(place ? medalArt(place) : undefined);
</script>

{#if name}
  <Art {name} alt={`${place}. místo`} {size} class="medal-icon" style={`width:${size}px;height:${size}px;display:inline-block;vertical-align:middle`} />
{:else}
  <span class="place">{place ? `${place}.` : '–'}</span>
{/if}

<style>
  .place {
    display: inline-block;
    min-width: 1.6em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
</style>
