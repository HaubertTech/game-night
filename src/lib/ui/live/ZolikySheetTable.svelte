<script lang="ts">
  // Žolíky score sheet: points per round and the running totals (fewer is better).
  import type { ZolikyRoomView } from '../../live/table-games.ts';

  let { view }: { view: ZolikyRoomView } = $props();
</script>

<div class="wrap">
  <table class="sheet" data-testid="zoliky-sheet">
    <thead>
      <tr><th>Kolo</th>{#each view.players as p (p.id)}<th>{p.name}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each view.rows as row, i (i)}
        <tr>
          <td>{i + 1}</td>
          {#each view.players as p (p.id)}<td>{row.scores[p.id] ?? 0}</td>{/each}
        </tr>
      {/each}
    </tbody>
    <tfoot>
      <tr><th>Součet</th>{#each view.players as p (p.id)}<th>{p.total}</th>{/each}</tr>
    </tfoot>
  </table>
</div>

<style>
  .wrap {
    overflow-x: auto;
  }
  .sheet {
    border-collapse: collapse;
    width: 100%;
  }
  .sheet th,
  .sheet td {
    border-bottom: 1px solid var(--line);
    padding: 6px 8px;
    text-align: left;
  }
</style>
