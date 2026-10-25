<script lang="ts">
  // The board of Člověče, nezlob se as one SVG: ring, start arrows, yards and homes in the four
  // colours (each with its shape), pawns as wooden pegs with the shape on the head. Pawns that may
  // move are marked and clickable; the target field of the focused pawn is outlined. A new move
  // walks the pawn field by field (onStep counts aloud), a captured pawn then jumps home.
  // With prefers-reduced-motion the pawns jump straight to their place.
  import { onDestroy } from 'svelte';
  import { COLOR_LABELS, SHAPE_LABELS, TRACK, YARD, type CloveceColor, type CloveceMove, type LastMove } from '../../games/clovece/engine.ts';
  import { cellOf, COLOR_SHAPES, COLOR_STYLE, HOME_CELLS, pathOf, RING, shapePath, startArrow, YARD_CELLS, type Cell } from './geometry.ts';

  interface BoardPlayer {
    id: string;
    name: string;
    color: CloveceColor;
  }

  let {
    players,
    pawns,
    lastMove = null,
    turn = null,
    moves = [],
    focus = null,
    interactive = false,
    onPick,
    onStep,
    label = 'Hrací plán Člověče, nezlob se',
  }: {
    players: BoardPlayer[];
    pawns: number[][];
    lastMove?: LastMove | null;
    /** Player on turn (its legal moves are `moves`). */
    turn?: string | null;
    moves?: CloveceMove[];
    /** Pawn whose target to outline (advice, hover); with one legal move it is that one. */
    focus?: number | null;
    /** The viewer may pick a pawn now. */
    interactive?: boolean;
    onPick?: (pawn: number) => void;
    /** Called for every step of an animated move (1, 2, 3 …). */
    onStep?: (n: number, total: number) => void;
    label?: string;
  } = $props();

  const C = 40;
  const SIZE = C * 11;
  const at = (c: Cell) => ({ x: c[0] * C + C / 2, y: c[1] * C + C / 2 });

  let hovered = $state<number | null>(null);
  // svelte-ignore state_referenced_locally
  let display = $state<number[][]>(pawns.map((p) => [...p]));
  let animating = $state(false);
  // svelte-ignore state_referenced_locally
  let shownSeq = lastMove?.seq ?? 0;
  /** Where the pawns end after the running animation (newer states replace it). */
  let finalTarget: number[][] = [];
  let timers: ReturnType<typeof setTimeout>[] = [];

  function reducedMotion(): boolean {
    try {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function clearTimers() {
    for (const t of timers) clearTimeout(t);
    timers = [];
  }
  onDestroy(clearTimers);

  $effect(() => {
    const target = pawns.map((p) => [...p]);
    const move = lastMove;
    finalTarget = target;
    if (move && move.seq === shownSeq && animating) return;
    if (!move || move.seq === shownSeq || reducedMotion()) {
      if (move) shownSeq = move.seq;
      clearTimers();
      animating = false;
      display = target;
      return;
    }
    shownSeq = move.seq;
    clearTimers();
    const pi = players.findIndex((p) => p.id === move.playerId);
    if (pi < 0) {
      display = target;
      return;
    }
    const path = pathOf(move.from, move.to);
    const start = target.map((p) => [...p]);
    start[pi][move.pawn] = move.from;
    if (move.captured) {
      const vi = players.findIndex((p) => p.id === move.captured!.playerId);
      if (vi >= 0) start[vi][move.captured.pawn] = move.captured.from;
    }
    display = start;
    animating = true;
    path.forEach((rel, k) => {
      timers.push(
        setTimeout(() => {
          const next = display.map((p) => [...p]);
          next[pi][move.pawn] = rel;
          display = next;
          onStep?.(k + 1, path.length);
        }, 230 * (k + 1)),
      );
    });
    timers.push(
      setTimeout(() => {
        display = finalTarget;
        animating = false;
      }, 230 * path.length + (move.captured ? 380 : 60)),
    );
  });

  const turnIndex = $derived(players.findIndex((p) => p.id === turn));
  const movable = $derived(new Map(moves.map((m) => [m.pawn, m])));
  const shown = $derived(hovered ?? focus ?? (moves.length === 1 ? moves[0].pawn : null));
  const targetCell = $derived.by(() => {
    if (shown === null || turnIndex < 0 || animating) return null;
    const m = movable.get(shown);
    return m ? cellOf(players[turnIndex].color, m.to, m.pawn) : null;
  });

  /** Pawns per cell, for nudging pawns that share a field (no-capture variant). */
  const placed = $derived.by(() => {
    const list: { pi: number; k: number; cell: Cell; dx: number; dy: number }[] = [];
    const count = new Map<string, number>();
    players.forEach((p, pi) =>
      (display[pi] ?? []).forEach((rel, k) => {
        const cell = cellOf(p.color, rel, k);
        const key = cell.join(',');
        const n = count.get(key) ?? 0;
        count.set(key, n + 1);
        list.push({ pi, k, cell, dx: n * 7, dy: -n * 5 });
      }),
    );
    return list;
  });

  function where(color: CloveceColor, rel: number): string {
    if (rel === YARD) return 've startovním domečku';
    if (rel >= TRACK) return `v cíli, ${rel - TRACK + 1}. pole`;
    return `na okruhu, ${rel + 1}. pole od startu`;
  }

  function pawnLabel(pi: number, k: number): string {
    const p = players[pi];
    const m = pi === turnIndex ? movable.get(k) : undefined;
    const base = `${p.name}: figurka ${k + 1} (${COLOR_LABELS[p.color]}, ${SHAPE_LABELS[COLOR_SHAPES[p.color]]}) ${where(p.color, display[pi][k])}`;
    if (!m) return base;
    const goes = m.kind === 'enter' ? 'nasadit na start' : m.to >= TRACK ? 'do domečku' : `o ${m.to - m.from} polí`;
    return `${base} — táhnout: ${goes}${m.captures ? ', vyhodí soupeře' : ''}`;
  }

  function pick(pi: number, k: number) {
    if (!interactive || pi !== turnIndex || !movable.has(k) || animating) return;
    onPick?.(k);
  }
</script>

<svg
  class="board"
  viewBox={`-6 -6 ${SIZE + 12} ${SIZE + 12}`}
  role="group"
  aria-label={label}
  data-testid="clovece-board"
  data-animating={animating ? 'yes' : 'no'}
>
  <rect x="-6" y="-6" width={SIZE + 12} height={SIZE + 12} rx="26" class="plate" />

  <!-- yards: a soft square in each corner -->
  {#each players as p (p.id)}
    {@const s = COLOR_STYLE[p.color]}
    {@const [a] = YARD_CELLS[p.color]}
    <rect x={a[0] * C + 2} y={a[1] * C + 2} width={C * 2 - 4} height={C * 2 - 4} rx="18" fill={s.tint} stroke={s.fill} stroke-width="2" />
  {/each}

  <!-- ring -->
  {#each RING as cell, i (i)}
    {@const pos = at(cell)}
    <circle cx={pos.x} cy={pos.y} r="15" class="field" />
  {/each}

  <!-- start fields with an arrow, home rows, yard spots of every colour on the board -->
  {#each (['red', 'blue', 'green', 'yellow'] as const) as color (color)}
    {@const s = COLOR_STYLE[color]}
    {@const arrow = startArrow(color)}
    {@const ap = at(arrow.cell)}
    {@const used = players.some((p) => p.color === color)}
    <g opacity={used ? 1 : 0.35}>
      <circle cx={ap.x} cy={ap.y} r="16" fill={s.fill} stroke={s.edge} stroke-width="2" />
      <path d="M -7 -6 L 6 0 L -7 6 Z" fill={s.mark} transform={`translate(${ap.x} ${ap.y}) rotate(${arrow.angle})`} />
      {#each HOME_CELLS[color] as cell, h (h)}
        {@const pos = at(cell)}
        <circle cx={pos.x} cy={pos.y} r="15" fill={s.tint} stroke={s.fill} stroke-width="2.5" />
        <path d={shapePath(COLOR_SHAPES[color], 5)} transform={`translate(${pos.x} ${pos.y})`} fill={s.fill} opacity="0.55" />
      {/each}
      {#each YARD_CELLS[color] as cell, h (h)}
        {@const pos = at(cell)}
        <circle cx={pos.x} cy={pos.y} r="13" fill="none" stroke={s.fill} stroke-width="1.5" stroke-dasharray="3 3" />
      {/each}
    </g>
  {/each}

  <!-- centre -->
  <circle cx={SIZE / 2} cy={SIZE / 2} r="13" class="centre" />

  {#if targetCell}
    {@const tp = at(targetCell)}
    <circle cx={tp.x} cy={tp.y} r="19" class="target" stroke={COLOR_STYLE[players[turnIndex].color].edge} data-testid="clovece-target" />
  {/if}

  <!-- pawns -->
  {#each placed as { pi, k, cell, dx, dy } (`${pi}-${k}`)}
    {@const p = players[pi]}
    {@const s = COLOR_STYLE[p.color]}
    {@const pos = at(cell)}
    {@const canMove = interactive && pi === turnIndex && movable.has(k) && !animating}
    {@const marked = pi === turnIndex && movable.has(k) && !animating}
    <g
      class="pawn"
      class:can={canMove}
      class:marked
      style={`transform: translate(${pos.x + dx}px, ${pos.y + dy}px)`}
      data-testid="clovece-pawn"
      data-player={p.id}
      data-pawn={k}
      data-movable={marked ? 'true' : 'false'}
      role="button"
      aria-disabled={!canMove}
      tabindex={canMove ? 0 : -1}
      aria-label={pawnLabel(pi, k)}
      onclick={() => pick(pi, k)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick(pi, k);
        }
      }}
      onpointerenter={() => marked && (hovered = k)}
      onpointerleave={() => (hovered = null)}
      onfocus={() => marked && (hovered = k)}
      onblur={() => (hovered = null)}
    >
      {#if marked}<circle r="18" class="halo" stroke={s.edge} />{/if}
      <ellipse cx="0" cy="12" rx="11" ry="4" class="shadow" />
      <path d="M -10 12 Q -9 -2 -4 -5 L 4 -5 Q 9 -2 10 12 Z" fill={s.fill} stroke={s.edge} stroke-width="2" />
      <circle cx="0" cy="-9" r="8" fill={s.fill} stroke={s.edge} stroke-width="2" />
      <path d={shapePath(COLOR_SHAPES[p.color], 4.2)} transform="translate(0 -9)" fill={s.mark} />
    </g>
  {/each}
</svg>

<style>
  .board {
    width: 100%;
    height: auto;
    display: block;
    user-select: none;
    touch-action: manipulation;
  }
  .plate {
    fill: #f3e6cc;
    stroke: var(--clay-dark);
    stroke-width: 3;
  }
  .field {
    fill: var(--paper);
    stroke: var(--ink-soft);
    stroke-width: 2;
  }
  .centre {
    fill: var(--clay-light);
    stroke: var(--clay);
    stroke-width: 2;
  }
  .target {
    fill: none;
    stroke-width: 3.5;
    stroke-dasharray: 5 4;
  }
  .pawn {
    transition: transform 200ms ease-out;
    outline: none;
  }
  .pawn.can {
    cursor: pointer;
  }
  .pawn:focus-visible .halo {
    stroke-width: 5;
  }
  .halo {
    fill: rgba(251, 248, 241, 0.85);
    stroke-width: 4;
    animation: pulse 1.1s ease-in-out infinite;
  }
  .shadow {
    fill: rgba(59, 51, 43, 0.25);
  }
  @keyframes pulse {
    50% {
      stroke-opacity: 0.55;
      transform: scale(1.12);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pawn {
      transition: none;
    }
    .halo {
      animation: none;
    }
  }
</style>
