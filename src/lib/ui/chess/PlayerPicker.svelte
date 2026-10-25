<script lang="ts">
  import { LEVELS, LEVEL_LABELS } from '../../types.ts';
  import { LEVEL_ART } from '../art/art.ts';
  import ArtIcon from '../live/ArtIcon.svelte';
  import Avatar from '../art/Avatar.svelte';
  import type { Profile } from '../../storage.ts';
  import type { Learner as Picked } from './storage.ts';

  let {
    profiles,
    value,
    label,
    guestName = 'Host',
    allowGuest = true,
    onchange,
  }: {
    profiles: Profile[];
    value: Picked | null;
    label: string;
    guestName?: string;
    allowGuest?: boolean;
    onchange: (p: Picked) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let guest = $state<Picked>({ id: `host-${guestName}`, name: guestName, avatar: '🙂', level: 'lavice' });
  const isGuest = $derived(!!value && !profiles.some((p) => p.id === value.id));

  function pickGuest() {
    onchange({ ...guest });
  }
</script>

<div class="picker stack" role="group" aria-label={label}>
  <div class="row">
    {#each profiles as p (p.id)}
      <button type="button" class="chip" aria-pressed={value?.id === p.id} onclick={() => onchange({ id: p.id, name: p.name, avatar: p.avatar, level: p.level })}>
        <Avatar value={p.avatar} />{p.name}
      </button>
    {/each}
    {#if allowGuest}
      <button type="button" class="chip" aria-pressed={isGuest} onclick={pickGuest}>✏️ Jen jméno</button>
    {/if}
  </div>
  {#if allowGuest && isGuest}
    <div class="row">
      <input
        type="text"
        aria-label={`${label} — jméno`}
        bind:value={guest.name}
        maxlength="24"
        oninput={() => onchange({ ...guest, name: guest.name.trim() || guestName })}
      />
      {#each LEVELS as level (level)}
        <button
          type="button"
          class="chip"
          aria-pressed={guest.level === level}
          onclick={() => {
            guest.level = level;
            onchange({ ...guest });
          }}><ArtIcon name={LEVEL_ART[level]} /> {LEVEL_LABELS[level]}</button
        >
      {/each}
    </div>
  {/if}
</div>
