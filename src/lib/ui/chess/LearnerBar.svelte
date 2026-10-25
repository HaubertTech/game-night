<script lang="ts">
  import { onMount } from 'svelte';
  import PlayerPicker from './PlayerPicker.svelte';
  import { loadLearner, saveLearner, type Learner } from './storage.ts';
  import { loadProfiles, type Profile } from '../../storage.ts';

  let { learner = $bindable() }: { learner: Learner | null } = $props();
  let profiles = $state<Profile[]>([]);
  let open = $state(false);

  onMount(() => {
    profiles = loadProfiles();
    learner = loadLearner();
  });

  function change(p: Learner) {
    learner = p;
    saveLearner(p);
  }
</script>

{#if learner}
  <div class="learner row">
    <span>Učí se: <strong>{learner.avatar} {learner.name}</strong></span>
    <button type="button" class="btn small" onclick={() => (open = !open)}>{open ? 'Hotovo' : 'Změnit hráče'}</button>
  </div>
  {#if open}
    <div class="card"><PlayerPicker {profiles} value={learner} label="Kdo se učí" guestName="Host" onchange={change} /></div>
  {/if}
{/if}

<style>
  .learner {
    justify-content: space-between;
  }
</style>
