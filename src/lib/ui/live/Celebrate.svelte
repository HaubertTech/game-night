<script lang="ts">
  // End of a game: the owl celebrating next to the winner's cup.
  import Art from '../art/Art.svelte';

  let { size = 120 }: { size?: number } = $props();
</script>

<div class="celebrate" style={`--s:${size}px`}>
  <Art name="mascot.sova-slavi" alt="Sova slaví" size={size} eager style="width:var(--s);height:var(--s)" />
  <Art name="rewards.vitez-vecera" alt="Pohár pro vítěze" size={size} eager style="width:var(--s);height:var(--s)" />
</div>

<style>
  .celebrate {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: 8px;
  }
</style>
