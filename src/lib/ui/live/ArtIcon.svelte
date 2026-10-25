<script lang="ts">
  // Small inline illustration sized in em, so it sits in text like the emoji it replaces.
  import Art from '../art/Art.svelte';

  let { name, em = 1.4, px = 48, label }: { name: string; em?: number; /** Rendered size for picking the file. */ px?: number; /** Alt text; without it the icon is decorative. */ label?: string } = $props();
</script>

<Art {name} size={px} alt={label} decorative={!label} style={`display:inline-block;width:${em}em;height:${em}em;object-fit:contain;vertical-align:middle`} />
