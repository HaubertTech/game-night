<script lang="ts">
  import Piece from './Piece.svelte';
  import { PIECE_LABEL, type BoardMark, type BoardMove, type PieceType } from './pieces.ts';

  let {
    fen,
    orientation = 'w',
    interactive = true,
    legal = [],
    showDots = true,
    lastMove = null,
    check = null,
    stars = [],
    marks = [],
    onmove,
  }: {
    fen: string;
    orientation?: 'w' | 'b';
    interactive?: boolean;
    legal?: BoardMove[];
    showDots?: boolean;
    lastMove?: { from: string; to: string } | null;
    check?: string | null;
    stars?: string[];
    marks?: BoardMark[];
    onmove?: (uci: string) => void;
  } = $props();

  const FILES = 'abcdefgh';
  const PROMOS: PieceType[] = ['q', 'r', 'b', 'n'];

  interface PlacedPiece {
    square: string;
    type: PieceType;
    color: 'w' | 'b';
  }

  const pieces = $derived.by(() => {
    const out: PlacedPiece[] = [];
    const rows = fen.split(' ')[0].split('/');
    rows.forEach((row, i) => {
      let file = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) {
          file += Number(ch);
          continue;
        }
        const lower = ch.toLowerCase() as PieceType;
        out.push({ square: FILES[file] + String(8 - i), type: lower, color: ch === lower ? 'b' : 'w' });
        file++;
      }
    });
    return out;
  });
  const turn = $derived(fen.split(' ')[1] === 'b' ? 'b' : 'w');
  const bySquare = $derived(new Map(pieces.map((p) => [p.square, p])));

  let selected = $state<string | null>(null);
  let drag = $state<{ square: string; x: number; y: number; startX: number; startY: number; active: boolean } | null>(null);
  let promotion = $state<{ from: string; to: string } | null>(null);
  let svg: SVGSVGElement | undefined = $state();

  // A new position clears the selection.
  $effect(() => {
    void fen;
    selected = null;
    promotion = null;
    drag = null;
  });

  function xy(square: string): { x: number; y: number } {
    const f = FILES.indexOf(square[0]);
    const r = Number(square[1]) - 1;
    return orientation === 'w' ? { x: f * 100, y: (7 - r) * 100 } : { x: (7 - f) * 100, y: r * 100 };
  }

  const squares = $derived(
    Array.from({ length: 64 }, (_, i) => {
      const f = i % 8;
      const r = Math.floor(i / 8);
      const name = FILES[f] + String(r + 1);
      return { name, dark: (f + r) % 2 === 0, ...xy(name) };
    }),
  );

  const targets = $derived(selected ? legal.filter((m) => m.from === selected) : []);
  const targetSet = $derived(new Set(targets.map((m) => m.to)));
  const markTone = $derived(new Map(marks.map((m) => [m.square, m.tone])));

  function svgPoint(ev: PointerEvent): { x: number; y: number } | null {
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: ((ev.clientX - rect.left) / rect.width) * 800, y: ((ev.clientY - rect.top) / rect.height) * 800 };
  }

  function squareAt(p: { x: number; y: number }): string | null {
    const c = Math.floor(p.x / 100);
    const r = Math.floor(p.y / 100);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    return orientation === 'w' ? FILES[c] + String(8 - r) : FILES[7 - c] + String(r + 1);
  }

  function canSelect(square: string): boolean {
    const p = bySquare.get(square);
    return !!p && (p.color === turn || legal.some((m) => m.from === square));
  }

  function tryMove(from: string, to: string): boolean {
    const options = legal.filter((m) => m.from === from && m.to === to);
    if (!options.length) return false;
    if (options.some((m) => m.promotion)) {
      promotion = { from, to };
      return true;
    }
    selected = null;
    onmove?.(from + to);
    return true;
  }

  function choosePromotion(type: PieceType) {
    if (!promotion) return;
    const uci = promotion.from + promotion.to + type;
    promotion = null;
    selected = null;
    onmove?.(uci);
  }

  function down(ev: PointerEvent) {
    if (!interactive || promotion) return;
    const p = svgPoint(ev);
    const sq = p && squareAt(p);
    if (!p || !sq) return;
    if (selected && targetSet.has(sq)) {
      tryMove(selected, sq);
      return;
    }
    if (canSelect(sq)) {
      selected = sq;
      drag = { square: sq, x: p.x, y: p.y, startX: p.x, startY: p.y, active: false };
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
    } else selected = null;
  }

  function move(ev: PointerEvent) {
    if (!drag) return;
    const p = svgPoint(ev);
    if (!p) return;
    const active = drag.active || Math.hypot(p.x - drag.startX, p.y - drag.startY) > 18;
    drag = { ...drag, x: p.x, y: p.y, active };
  }

  function up(ev: PointerEvent) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.active) return;
    const p = svgPoint(ev);
    const sq = p && squareAt(p);
    if (sq && sq !== d.square) tryMove(d.square, sq);
  }

  function key(ev: KeyboardEvent, square: string) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    if (selected && targetSet.has(square)) tryMove(selected, square);
    else if (canSelect(square)) selected = square;
  }

  function label(square: string): string {
    const p = bySquare.get(square);
    return p ? `${square} ${p.color === 'w' ? 'bílý' : 'černý'} ${PIECE_LABEL[p.type]}` : square;
  }

  function starPath(cx: number, cy: number, r: number): string {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
    }
    return `M${pts.join('L')}Z`;
  }
</script>

<div class="board" data-testid="chess-board" data-fen={fen} data-turn={turn}>
  <svg
    bind:this={svg}
    viewBox="0 0 800 800"
    role="application"
    aria-label="Šachovnice"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={() => (drag = null)}
  >
    {#each squares as s (s.name)}
      <rect
        x={s.x}
        y={s.y}
        width="100"
        height="100"
        class="sq"
        class:dark={s.dark}
        data-square={s.name}
        role="gridcell"
        tabindex={interactive && (canSelect(s.name) || targetSet.has(s.name)) ? 0 : -1}
        aria-label={label(s.name)}
        aria-selected={selected === s.name}
        onkeydown={(e) => key(e, s.name)}
      />
      {#if lastMove && (lastMove.from === s.name || lastMove.to === s.name)}
        <rect x={s.x} y={s.y} width="100" height="100" class="last" pointer-events="none" />
      {/if}
      {#if markTone.get(s.name)}
        <rect x={s.x + 4} y={s.y + 4} width="92" height="92" rx="10" class={`mark ${markTone.get(s.name)}`} pointer-events="none" />
      {/if}
      {#if selected === s.name}
        <rect x={s.x} y={s.y} width="100" height="100" class="selected" pointer-events="none" />
      {/if}
      {#if check === s.name}
        <circle cx={s.x + 50} cy={s.y + 50} r="48" class="check" pointer-events="none" />
      {/if}
    {/each}

    {#each squares as s (s.name)}
      {#if (orientation === 'w' ? s.name[1] === '1' : s.name[1] === '8')}
        <text x={s.x + 92} y={s.y + 94} class="coord" class:on-dark={s.dark} text-anchor="end" pointer-events="none">{s.name[0]}</text>
      {/if}
      {#if (orientation === 'w' ? s.name[0] === 'a' : s.name[0] === 'h')}
        <text x={s.x + 7} y={s.y + 22} class="coord" class:on-dark={s.dark} pointer-events="none">{s.name[1]}</text>
      {/if}
    {/each}

    {#each stars as st (st)}
      {@const p = xy(st)}
      <path d={starPath(p.x + 50, p.y + 50, 30)} class="star" data-star={st} pointer-events="none" />
    {/each}

    {#each pieces as p (p.square + p.type + p.color)}
      {#if !(drag?.active && drag.square === p.square)}
        {@const pos = xy(p.square)}
        <g data-piece={`${p.color}${p.type}`} data-on={p.square} pointer-events="none">
          <Piece type={p.type} color={p.color} x={pos.x} y={pos.y} />
        </g>
      {/if}
    {/each}

    {#if showDots}
      {#each targets as t (t.to + (t.promotion ?? ''))}
        {@const p = xy(t.to)}
        {#if bySquare.has(t.to)}
          <circle cx={p.x + 50} cy={p.y + 50} r="44" class="ring" pointer-events="none" />
        {:else}
          <circle cx={p.x + 50} cy={p.y + 50} r="15" class="dot" pointer-events="none" />
        {/if}
      {/each}
    {/if}

    {#if drag?.active}
      {@const p = bySquare.get(drag.square)}
      {#if p}
        <g pointer-events="none" class="dragging">
          <Piece type={p.type} color={p.color} x={drag.x - 60} y={drag.y - 75} size={120} />
        </g>
      {/if}
    {/if}
  </svg>

  {#if promotion}
    <div class="promo" role="dialog" aria-label="Proměna pěšce">
      <p>V co se pěšec promění?</p>
      <div class="promo-row">
        {#each PROMOS as t (t)}
          <button type="button" class="promo-btn" aria-label={`Proměnit v: ${PIECE_LABEL[t]}`} onclick={() => choosePromotion(t)}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><Piece type={t} color={turn} /></svg>
          </button>
        {/each}
      </div>
      <button type="button" class="btn small" onclick={() => (promotion = null)}>Zpět</button>
    </div>
  {/if}
</div>

<style>
  .board {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 14px;
    box-shadow: 0 3px 0 rgba(59, 51, 43, 0.25);
    border: 3px solid var(--ink);
    box-sizing: border-box;
    background: #efe6d4;
  }
  .sq {
    fill: #efe6d4;
    outline: none;
  }
  .sq.dark {
    fill: #9aab89;
  }
  .sq:focus-visible {
    stroke: var(--slate-dark);
    stroke-width: 6;
  }
  .last {
    fill: rgba(213, 168, 92, 0.42);
  }
  .selected {
    fill: rgba(108, 127, 147, 0.45);
  }
  .check {
    fill: rgba(170, 70, 50, 0.55);
  }
  .mark {
    fill: none;
    stroke-width: 7;
  }
  .mark.hint {
    stroke: var(--slate-dark);
  }
  .mark.danger {
    stroke: var(--bad);
    stroke-dasharray: 14 8;
  }
  .mark.good {
    stroke: var(--sage-dark);
  }
  .coord {
    font: 700 19px var(--font, sans-serif);
    fill: #7a8b6a;
  }
  .coord.on-dark {
    fill: var(--cream);
  }
  .dot {
    fill: rgba(59, 51, 43, 0.32);
  }
  .ring {
    fill: none;
    stroke: rgba(59, 51, 43, 0.32);
    stroke-width: 8;
  }
  .star {
    fill: #e2b54a;
    stroke: var(--clay-dark);
    stroke-width: 4;
    stroke-linejoin: round;
  }
  .dragging {
    filter: drop-shadow(0 6px 6px rgba(0, 0, 0, 0.25));
  }
  .promo {
    position: absolute;
    inset: 18% 8%;
    background: var(--paper, #fbf8f1);
    border: 3px solid var(--ink);
    border-radius: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px;
    box-shadow: 0 6px 0 rgba(59, 51, 43, 0.25);
  }
  .promo p {
    margin: 0;
    font-weight: 800;
    font-size: 1.2rem;
  }
  .promo-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .promo-btn {
    width: 84px;
    height: 84px;
    border: 2px solid var(--ink);
    border-radius: 14px;
    background: #efe6d4;
    padding: 4px;
  }
  .promo-btn svg {
    width: 100%;
    height: 100%;
    border: none;
    box-shadow: none;
    background: none;
  }
</style>
