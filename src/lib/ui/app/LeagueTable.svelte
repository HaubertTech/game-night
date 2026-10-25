<script lang="ts">
  import { placeMedal } from './api.ts';

  interface Row {
    playerId: string;
    points: number;
    matches: number;
    wins: number;
    average: number;
    place: number;
  }

  let {
    rows,
    names,
    testid = 'league-table',
    empty = 'Zatím žádná dohraná partie.',
  }: { rows: Row[]; names: Record<string, string>; testid?: string; empty?: string } = $props();
</script>

{#if rows.length === 0}
  <p class="empty">{empty}</p>
{:else}
  <table class="table" data-testid={testid}>
    <thead>
      <tr><th>#</th><th>Hráč</th><th class="num">Body</th><th class="num">Partie</th><th class="num">Výhry</th><th class="num">Ø</th></tr>
    </thead>
    <tbody>
      {#each rows as r (r.playerId)}
        <tr class:first={r.place === 1 && r.matches > 0}>
          <td>{placeMedal(r.place)}</td>
          <td><a href={`/hrac/${r.playerId}`}>{names[r.playerId] ?? '?'}</a></td>
          <td class="num" data-testid="points">{r.points}</td>
          <td class="num">{r.matches}</td>
          <td class="num">{r.wins}</td>
          <td class="num">{r.average.toLocaleString('cs-CZ')}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
