<script lang="ts">
  import QRCode from 'qrcode';

  let { text, label }: { text: string; label: string } = $props();
  let svg = $state('');

  $effect(() => {
    const value = text;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#3b332b', light: '#ffffff' } })
      .then((s) => {
        if (value === text) svg = s;
      })
      .catch((err: Error) => console.warn('[qr] render failed', { err: err.message }));
  });
</script>

<figure class="qr" aria-label={label} data-testid="qr">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG generated locally by qrcode -->
  {@html svg}
</figure>

<style>
  .qr {
    margin: 0;
    width: 100%;
    aspect-ratio: 1;
    background: #fff;
    border-radius: var(--radius-sm);
    padding: 10px;
    border: 2px solid var(--line);
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
