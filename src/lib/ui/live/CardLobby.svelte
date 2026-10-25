<script lang="ts">
  import Avatar from '#lib/ui/art/Avatar.svelte';
  // Lobby of a table room (cards, Člověče) on the TV: the join code, who sits at the table (people and computers)
  // and the start button for the host.
  import type { Presence } from '../../live/protocol.ts';
  import type { TableSeat } from '../../live/table-games.ts';
  import { LEVEL_LABELS } from '../karty-hra/storage.ts';
  import JoinPanel from './JoinPanel.svelte';

  let {
    code,
    seats,
    presence,
    isHost,
    note,
    onStart,
    startLabel = '▶️ Rozdat karty',
    computerLabel = (s: TableSeat) => `🤖 počítač · ${LEVEL_LABELS[s.ai!]}`,
  }: {
    code: string;
    seats: TableSeat[];
    presence: Record<string, Presence>;
    isHost: boolean;
    note: string;
    onStart: () => void;
    startLabel?: string;
    computerLabel?: (s: TableSeat) => string;
  } = $props();

  function label(s: TableSeat): string {
    if (s.ai) return computerLabel(s);
    const p = presence[s.id];
    if (p?.online) return '📱 připojen(a)';
    if (p?.claimed) return '📴 telefon odpojen';
    return '⏳ čeká na telefon';
  }
</script>

<section class="g-lobby">
  <JoinPanel {code} />
  <div class="stack">
    <h1>Kdo hraje</h1>
    <ul class="g-people">
      {#each seats as s (s.id)}
        <li data-testid="lobby-contestant" data-contestant={s.id} data-online={s.ai || presence[s.id]?.online ? 'yes' : 'no'}>
          <span class="emoji g-avatar"><Avatar value={s.avatar} px={96} /></span>
          <strong class="g-grow">{s.name}{#if s.hints} 💡{/if}</strong>
          <span class="muted">{label(s)}</span>
        </li>
      {/each}
    </ul>
    <p class="muted">{note}</p>
    {#if isHost}<button class="btn primary big" onclick={onStart}>{startLabel}</button>{/if}
  </div>
</section>
