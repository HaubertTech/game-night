<script lang="ts" module>
  let uid = 0;
</script>

<script lang="ts">
  // One playing card as inline SVG (100 × 150). Mariášové (prší) and French (žolíky) cards are
  // our own simple drawings: suit symbols, pips and plain figures, readable on a tablet.
  import {
    FRENCH_RANK_SHORT,
    FRENCH_RED,
    MARIAS_RANK_SHORT,
    frenchCard,
    frenchCardName,
    isFrenchCardId,
    mariasCard,
    mariasCardName,
    type FrenchSuit,
    type MariasSuit,
  } from '#lib/games/karty-hra/cards.ts';

  interface Props {
    id?: string | null;
    /** Show the back. `back` picks the colour: 'marias', 'french-0', 'french-1'. */
    faceDown?: boolean;
    back?: 'marias' | 'french-0' | 'french-1';
    width?: number;
    label?: string;
  }

  let { id = null, faceDown = false, back = 'marias', width = 84, label }: Props = $props();

  const pid = `kh${++uid}`;
  const french = $derived(!!id && isFrenchCardId(id));
  const name = $derived(label ?? (faceDown || !id ? 'karta rubem nahoru' : french ? frenchCardName(id) : mariasCardName(id)));

  type Kind = { type: 'marias'; suit: MariasSuit; rank: string } | { type: 'french'; suit: FrenchSuit; rank: number } | { type: 'joker'; deck: number } | null;
  const kind: Kind = $derived.by(() => {
    if (!id || faceDown) return null;
    if (french) {
      const c = frenchCard(id);
      return c.joker ? { type: 'joker', deck: c.deck } : { type: 'french', suit: c.suit, rank: c.rank };
    }
    const c = mariasCard(id);
    return { type: 'marias', suit: c.suit, rank: c.rank };
  });

  const MARIAS_COLOR: Record<MariasSuit, string> = { srdce: '#c2392f', listy: '#3d7a35', zaludy: '#8a5a1c', kule: '#d08a12' };
  const color = $derived(
    kind?.type === 'marias' ? MARIAS_COLOR[kind.suit] : kind?.type === 'french' ? (FRENCH_RED.has(kind.suit) ? '#c2392f' : '#2b2622') : '#6b3fa0',
  );
  const corner = $derived(kind?.type === 'marias' ? MARIAS_RANK_SHORT[kind.rank as keyof typeof MARIAS_RANK_SHORT] : kind?.type === 'french' ? FRENCH_RANK_SHORT[kind.rank as 1] : '★');

  // Pip positions in the card (x, y); the symbol is drawn upside down in the lower half.
  const L = 35;
  const R = 65;
  const C = 50;
  const PIPS: Record<number, [number, number][]> = {
    2: [[C, 34], [C, 116]],
    3: [[C, 34], [C, 75], [C, 116]],
    4: [[L, 34], [R, 34], [L, 116], [R, 116]],
    5: [[L, 34], [R, 34], [C, 75], [L, 116], [R, 116]],
    6: [[L, 34], [R, 34], [L, 75], [R, 75], [L, 116], [R, 116]],
    7: [[L, 34], [R, 34], [C, 54], [L, 75], [R, 75], [L, 116], [R, 116]],
    8: [[L, 34], [R, 34], [C, 54], [L, 75], [R, 75], [C, 96], [L, 116], [R, 116]],
    9: [[L, 32], [R, 32], [L, 60], [R, 60], [C, 75], [L, 90], [R, 90], [L, 118], [R, 118]],
    10: [[L, 32], [R, 32], [C, 46], [L, 60], [R, 60], [L, 90], [R, 90], [C, 104], [L, 118], [R, 118]],
  };

  const pips = $derived.by((): [number, number][] => {
    if (!kind) return [];
    if (kind.type === 'marias') {
      const n = Number(kind.rank);
      return Number.isInteger(n) ? PIPS[n] : [];
    }
    if (kind.type === 'french' && kind.rank >= 2 && kind.rank <= 10) return PIPS[kind.rank];
    return [];
  });

  const figure = $derived.by((): 'spodek' | 'svrsek' | 'kral' | 'dama' | 'kluk' | null => {
    if (!kind) return null;
    if (kind.type === 'marias') return kind.rank === 'spodek' || kind.rank === 'svrsek' || kind.rank === 'kral' ? kind.rank : null;
    if (kind.type === 'french') return kind.rank === 11 ? 'kluk' : kind.rank === 12 ? 'dama' : kind.rank === 13 ? 'kral' : null;
    return null;
  });
  const ace = $derived((kind?.type === 'marias' && kind.rank === 'eso') || (kind?.type === 'french' && kind.rank === 1));
  const backColor = $derived(back === 'french-1' ? '#a8603a' : back === 'french-0' ? '#4f6a86' : '#56664b');
</script>

{#snippet suitSymbol(x: number, y: number, s: number, flip: boolean)}
  <g transform="translate({x} {y}) scale({s}) {flip ? 'rotate(180)' : ''}">
    {#if kind?.type === 'marias'}
      {#if kind.suit === 'srdce'}
        <path d="M0 9 C-11 0 -11 -9 -5 -9 C-2 -9 0 -6 0 -4 C0 -6 2 -9 5 -9 C11 -9 11 0 0 9Z" fill={color} />
      {:else if kind.suit === 'listy'}
        <path d="M0 -10 C9 -5 8 5 0 9 C-8 5 -9 -5 0 -10Z" fill={color} />
        <path d="M0 -7 L0 11" stroke="#20431c" stroke-width="1.2" fill="none" />
        <path d="M0 -2 L-4 -5 M0 2 L4 -1 M0 5 L-3 3" stroke="#20431c" stroke-width="0.9" fill="none" />
      {:else if kind.suit === 'zaludy'}
        <ellipse cx="0" cy="3" rx="5.5" ry="7" fill="#c99a3c" />
        <path d="M-7 -1 C-7 -8 7 -8 7 -1Z" fill={color} />
        <path d="M-5 -4 L5 -4 M-6 -2 L6 -2" stroke="#5c3a10" stroke-width="0.7" />
        <path d="M0 -7 L1 -10" stroke={color} stroke-width="1.6" />
      {:else}
        <circle cx="0" cy="0" r="8" fill={color} />
        <path d="M-8 0 L8 0 M-6 -5 C-2 -2 2 -2 6 -5 M-6 5 C-2 2 2 2 6 5" stroke="#8a5408" stroke-width="1" fill="none" />
        <circle cx="0" cy="0" r="2" fill="#8a5408" />
      {/if}
    {:else if kind?.type === 'french'}
      {#if kind.suit === 'srdce'}
        <path d="M0 9 C-11 0 -11 -9 -5 -9 C-2 -9 0 -6 0 -4 C0 -6 2 -9 5 -9 C11 -9 11 0 0 9Z" fill={color} />
      {:else if kind.suit === 'kary'}
        <path d="M0 -10 L8 0 L0 10 L-8 0Z" fill={color} />
      {:else if kind.suit === 'krize'}
        <circle cx="0" cy="-5" r="4.5" fill={color} /><circle cx="-5" cy="2" r="4.5" fill={color} /><circle cx="5" cy="2" r="4.5" fill={color} />
        <path d="M0 0 L-3 10 L3 10Z" fill={color} />
      {:else}
        <path d="M0 -10 C-2 -5 -10 -1 -9 4 C-8 9 -2 8 0 4 C2 8 8 9 9 4 C10 -1 2 -5 0 -10Z" fill={color} />
        <path d="M0 2 L-3 10 L3 10Z" fill={color} />
      {/if}
    {/if}
  </g>
{/snippet}

{#snippet person(kindName: 'spodek' | 'svrsek' | 'kral' | 'dama' | 'kluk')}
  <!-- A plain friendly figure: head, robe in the suit colour, the hat tells the rank. -->
  <g>
    <rect x="22" y="26" width="56" height="98" rx="8" fill="#fbf3e2" stroke={color} stroke-width="1.5" />
    <path d="M30 120 L36 84 C40 76 60 76 64 84 L70 120Z" fill={color} opacity="0.9" />
    <path d="M44 84 L50 98 L56 84" fill="#fbf3e2" opacity="0.8" />
    <circle cx="50" cy="66" r="12" fill="#f2c9a0" stroke="#7a5638" stroke-width="1" />
    <circle cx="46" cy="65" r="1.4" fill="#3b332b" /><circle cx="54" cy="65" r="1.4" fill="#3b332b" />
    <path d="M46 71 C48 73 52 73 54 71" stroke="#7a5638" stroke-width="1.2" fill="none" />
    {#if kindName === 'kral'}
      <path d="M37 55 L39 43 L44 50 L50 40 L56 50 L61 43 L63 55Z" fill="#e2b33c" stroke="#8a6512" stroke-width="1" />
      <path d="M40 76 C44 82 56 82 60 76" stroke="#a88a6a" stroke-width="3" fill="none" />
    {:else if kindName === 'dama'}
      <path d="M38 56 C38 44 62 44 62 56 L58 52 L50 47 L42 52Z" fill="#e2b33c" stroke="#8a6512" stroke-width="1" />
      <path d="M38 60 C34 70 36 80 40 84 M62 60 C66 70 64 80 60 84" stroke="#8a5a1c" stroke-width="3" fill="none" />
    {:else if kindName === 'svrsek'}
      <path d="M36 56 L64 56 L58 48 L42 48Z" fill="#3b332b" />
      <path d="M58 49 C66 40 72 42 74 36" stroke={color} stroke-width="3" fill="none" stroke-linecap="round" />
    {:else}
      <path d="M38 57 C38 47 62 47 62 57Z" fill="#3b332b" />
      <path d="M36 57 L66 57" stroke="#3b332b" stroke-width="3" stroke-linecap="round" />
    {/if}
  </g>
  {#if kind?.type === 'marias' && kindName === 'svrsek'}
    {@render suitSymbol(50, 34, 0.9, false)}
  {:else if kind?.type === 'marias' && kindName === 'spodek'}
    {@render suitSymbol(50, 112, 0.9, false)}
  {:else}
    {@render suitSymbol(31, 38, 0.6, false)}
    {@render suitSymbol(69, 112, 0.6, true)}
  {/if}
{/snippet}

<svg class="kh-card" viewBox="0 0 100 150" width={width} height={width * 1.5} role="img" aria-label={name}>
  <defs>
    <pattern id="{pid}-p" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="12" height="12" fill={backColor} />
      <path d="M0 6 H12 M6 0 V12" stroke="rgba(255,255,255,0.22)" stroke-width="2" />
    </pattern>
  </defs>
  {#if !kind}
    <rect x="1.5" y="1.5" width="97" height="147" rx="9" fill="#fbf8f1" stroke="#3b332b" stroke-width="2" />
    <rect x="7" y="7" width="86" height="136" rx="6" fill="url(#{pid}-p)" />
    <circle cx="50" cy="75" r="17" fill="#fbf8f1" opacity="0.92" />
    <text x="50" y="81" text-anchor="middle" font-size="16" font-weight="800" fill={backColor}>DL</text>
  {:else}
    <rect x="1.5" y="1.5" width="97" height="147" rx="9" fill="#fffdf8" stroke="#3b332b" stroke-width="2" />
    {#if kind.type === 'joker'}
      <rect x="10" y="22" width="80" height="106" rx="8" fill="#f3ecfb" />
      <path d="M30 70 L38 40 L50 62 L62 40 L70 70Z" fill={kind.deck ? '#c2392f' : '#6b3fa0'} />
      <circle cx="38" cy="40" r="4" fill="#e2b33c" /><circle cx="62" cy="40" r="4" fill="#e2b33c" />
      <circle cx="50" cy="82" r="12" fill="#f2c9a0" stroke="#7a5638" />
      <circle cx="46" cy="80" r="1.4" fill="#3b332b" /><circle cx="54" cy="80" r="1.4" fill="#3b332b" />
      <path d="M44 86 C47 90 53 90 56 86" stroke="#7a5638" stroke-width="1.4" fill="none" />
      <path d="M50 100 L53 108 L62 108 L55 113 L58 122 L50 117 L42 122 L45 113 L38 108 L47 108Z" fill="#e2b33c" />
      <text x="50" y="18" text-anchor="middle" font-size="11" font-weight="800" fill="#6b3fa0">ŽOLÍK</text>
      <text x="50" y="142" text-anchor="middle" font-size="11" font-weight="800" fill="#6b3fa0">ŽOLÍK</text>
    {:else}
      <text x="9" y="22" font-size={corner.length > 1 ? 15 : 18} font-weight="800" fill={color}>{corner}</text>
      {@render suitSymbol(15, 33, 0.55, false)}
      <g transform="rotate(180 50 75)">
        <text x="9" y="22" font-size={corner.length > 1 ? 15 : 18} font-weight="800" fill={color}>{corner}</text>
        {@render suitSymbol(15, 33, 0.55, false)}
      </g>
      {#if figure}
        {@render person(figure)}
      {:else if ace}
        <circle cx="50" cy="75" r="30" fill="none" stroke={color} stroke-width="1.5" stroke-dasharray="3 4" />
        {@render suitSymbol(50, 75, 2.3, false)}
      {:else}
        {#each pips as [x, y], i (i)}
          {@render suitSymbol(x, y, 1, y > 80)}
        {/each}
      {/if}
    {/if}
  {/if}
</svg>

<style>
  .kh-card {
    display: block;
    filter: drop-shadow(0 2px 0 rgba(59, 51, 43, 0.25));
    font-family: var(--font);
    user-select: none;
  }
</style>
