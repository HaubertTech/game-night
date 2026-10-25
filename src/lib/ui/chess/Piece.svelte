<script lang="ts">
  import { PIECE_COLORS, PIECE_SHAPES, type PieceType } from './pieces.ts';

  let { type, color, x = 0, y = 0, size = 100 }: { type: PieceType; color: 'w' | 'b'; x?: number; y?: number; size?: number } = $props();

  const c = $derived(PIECE_COLORS[color]);
  const shapes = $derived(PIECE_SHAPES[type]);
</script>

<g transform={`translate(${x} ${y}) scale(${size / 100})`} stroke-linejoin="round" stroke-linecap="round">
  {#each shapes as s, i (i)}
    {#if s.detail}
      {#if s.kind === 'circle'}
        <circle cx={s.cx} cy={s.cy} r={s.r} fill={c.detail} stroke="none" />
      {:else}
        <path d={s.d} fill="none" stroke={c.detail} stroke-width="3" />
      {/if}
    {:else if s.kind === 'circle'}
      <circle cx={s.cx} cy={s.cy} r={s.r} fill={c.fill} stroke={c.stroke} stroke-width="4" />
    {:else if s.kind === 'rect'}
      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} fill={c.fill} stroke={c.stroke} stroke-width="4" />
    {:else}
      <path d={s.d} fill={c.fill} stroke={c.stroke} stroke-width="4" />
    {/if}
  {/each}
</g>
