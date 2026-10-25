<script lang="ts">
  // Quiet picture behind the waiting room: the owl on the sideboard on the TV (the empty left half
  // takes the QR code), the evening window with the sleeping dachshund on the phone.
  import Art from '../art/Art.svelte';

  let { kind }: { kind: 'tv' | 'phone' } = $props();
</script>

<div class="backdrop {kind}" aria-hidden="true">
  <Art name={kind === 'tv' ? 'env.lobby-tv' : 'env.lobby-mobil'} decorative eager sizes="100vw" />
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    background: var(--cream);
  }
  .backdrop :global(img) {
    width: 100%;
    height: 100%;
    max-width: none;
    object-fit: cover;
  }
  .tv :global(img) {
    object-position: right bottom;
  }
  .phone :global(img) {
    object-position: center bottom;
  }
</style>
