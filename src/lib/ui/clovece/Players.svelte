<script lang="ts">
  // The players around the board: colour with its shape, name, pawns at home, place, whose turn.
  import Avatar from '../art/Avatar.svelte';
  import { COLOR_LABELS, TRACK, type AiLevel, type CloveceColor } from '../../games/clovece/engine.ts';
  import { COLOR_SHAPES, COLOR_STYLE, shapePath } from './geometry.ts';

  interface Row {
    id: string;
    name: string;
    avatar?: string;
    color: CloveceColor;
    ai: AiLevel | null;
  }
  let {
    players,
    pawns,
    turn,
    places,
    finished = false,
    big = false,
    me = null,
  }: { players: Row[]; pawns: number[][]; turn: string; places: Record<string, number>; finished?: boolean; big?: boolean; me?: string | null } = $props();
</script>

<ul class="players" class:big>
  {#each players as p, i (p.id)}
    {@const s = COLOR_STYLE[p.color]}
    {@const home = pawns[i].filter((r) => r >= TRACK).length}
    <li class:turn={!finished && turn === p.id} class:mine={me === p.id} data-testid="clovece-player" data-player={p.id} data-place={places[p.id] ?? ''}>
      <svg viewBox="-14 -14 28 28" class="token" aria-label={`${COLOR_LABELS[p.color]} barva`} role="img">
        <circle r="13" fill={s.fill} stroke={s.edge} stroke-width="2" />
        <path d={shapePath(COLOR_SHAPES[p.color], 6)} fill={s.mark} />
      </svg>
      {#if p.avatar}<span class="emoji av"><Avatar value={p.avatar} px={big ? 96 : 48} /></span>{/if}
      <span class="name">{p.name}{#if p.ai && p.avatar !== '🤖'} 🤖{/if}</span>
      <span class="home" aria-label={`Doma ${home} z ${pawns[i].length}`}>🏠 {home}/{pawns[i].length}</span>
      {#if places[p.id]}<span class="place">{places[p.id]}. místo</span>{:else if !finished && turn === p.id}<span class="now">na tahu</span>{/if}
    </li>
  {/each}
</ul>

<style>
  .players {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--paper);
    font-weight: 700;
  }
  li.turn {
    border-color: var(--clay);
    box-shadow: 0 0 0 3px var(--clay-light);
  }
  li.mine .name {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .token {
    width: 28px;
    height: 28px;
    flex: none;
  }
  .big .token {
    width: 40px;
    height: 40px;
  }
  .big li {
    font-size: 1.35rem;
    padding: 10px 16px;
  }
  .av {
    font-size: 1.6rem;
  }
  .name {
    flex: 1;
    min-width: 0;
  }
  .home {
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .place,
  .now {
    font-size: 0.85em;
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .place {
    background: var(--sage-light);
  }
  .now {
    background: var(--clay-light);
  }
</style>
