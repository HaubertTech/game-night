<script lang="ts">
  // Prší table on a tablet: opponents on top, stock and discard pile in the middle, own fan at
  // the bottom. Computer seats move by themselves; hints highlight what may be played.
  import { page } from '$app/state';
  import { MARIAS_SUITS, MARIAS_SUIT_LABELS, mariasCard, mariasCardName, type MariasSuit } from '#lib/games/karty-hra/cards.ts';
  import { prsiAiStep } from '#lib/games/karty-hra/ai/autoplay.ts';
  import { choosePrsiMove, type PrsiAdvice } from '#lib/games/karty-hra/ai/prsi-ai.ts';
  import {
    applyPrsi,
    createPrsiGame,
    errorText,
    explainCard,
    fallbackMove,
    penaltyCards,
    playError,
    playerName,
    playableCards,
    topCard,
    type PrsiCommand,
    type PrsiGameState,
  } from '#lib/games/karty-hra/prsi-engine.ts';
  import { prsiSummary } from '#lib/cards/prsi.ts';
  import type { OwlPose } from '#lib/games/karty-hra/learn/lessons.ts';
  import Card from './Card.svelte';
  import Hand from './Hand.svelte';
  import Owl from '#lib/ui/art/Owl.svelte';
  import RulesSheet from './RulesSheet.svelte';
  import { LEVEL_LABELS, saveGame, type SavedGame } from './storage.ts';

  let { saved }: { saved: SavedGame<PrsiGameState> } = $props();

  const me = 'ja';
  const setup = $derived(saved.setup);
  // svelte-ignore state_referenced_locally
  let game: PrsiGameState = $state(saved.state);
  let advice = $state<PrsiAdvice | null>(null);
  let message: { pose: OwlPose; text: string } | null = $state(null);
  let picking: string | null = $state(null);
  let rulesOpen = $state(false);
  const fast = $derived(page.url.searchParams.has('rychle'));
  const kid = $derived(setup.audience === 'kid');

  const myTurn = $derived(game.phase === 'playing' && game.turn === me);
  const hand = $derived(game.hands[me] ?? []);
  const playable = $derived(myTurn ? playableCards(game, me) : []);
  const fallback = $derived(fallbackMove(game));
  const top = $derived(topCard(game));
  const opponents = $derived(game.players.filter((p) => p.id !== me));

  // Computer seats.
  $effect(() => {
    if (game.phase !== 'playing' || game.turn === me) return;
    const current = game;
    const timer = setTimeout(() => {
      game = prsiAiStep(current, Date.now());
    }, fast ? 40 : 950);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    saveGame('prsi', { setup: $state.snapshot(setup), state: $state.snapshot(game) as PrsiGameState });
  });

  /** What the owl says about the table when nothing else is going on. */
  const commentary = $derived.by((): { pose: OwlPose; text: string } => {
    if (game.phase === 'finished') return { pose: 'slavi', text: 'Konec hry! Podívej se na pořadí.' };
    if (game.phase === 'dealEnd') return { pose: 'slavi', text: 'Partie skončila.' };
    if (game.out.includes(me)) return { pose: 'slavi', text: `Hurá, jsi bez karet! Ostatní ještě hrají o pořadí.` };
    const last = game.log[game.log.length - 1];
    const who = last && 'playerId' in last && last.playerId !== me ? playerName(game, last.playerId) : null;
    const lastText = !who
      ? ''
      : last?.type === 'play'
        ? last.suit
          ? `${who}: svršek, přeje si ${MARIAS_SUIT_LABELS[last.suit]}. `
          : `${who}: ${mariasCardName(last.cardId)}. `
        : last?.type === 'draw'
          ? `${who}: +${last.count} ${last.count === 1 ? 'karta' : last.count < 5 ? 'karty' : 'karet'}. `
          : last?.type === 'stand'
            ? `${who} stojí. `
            : '';
    if (!myTurn) return { pose: 'premysli', text: `${lastText}Hraje ${playerName(game, game.turn)}…` };
    if (!setup.hints) return { pose: 'otazka', text: `${lastText}Jsi na řadě.` };
    if (game.pendingSevens > 0) {
      return { pose: 'otazka', text: `${lastText}Platí sedma! ${playable.length ? 'Přebij ji sedmou, nebo' : 'Nemáš sedmu, tak'} si vezmi ${penaltyCards(game)} karty.` };
    }
    if (game.pendingAce) return { pose: 'otazka', text: `${lastText}Platí eso! ${playable.length ? 'Přebij ho esem, nebo stůj.' : 'Nemáš eso, tak jedno kolo stojíš.'}` };
    if (playable.length === 0) return { pose: 'premysli', text: `${lastText}Nemáš co dát — lízni si kartu.` };
    return {
      pose: 'otazka',
      text: kid
        ? `${lastText}Jsi na řadě! Karty se zeleným rámečkem můžeš dát — mají stejnou barvu nebo hodnotu.`
        : `${lastText}Jsi na řadě.`,
    };
  });

  const owl = $derived(message ?? commentary);

  // A new move clears the owl's advice.
  let seenSeq = 0;
  $effect(() => {
    if (game.seq !== seenSeq) {
      seenSeq = game.seq;
      advice = null;
      message = null;
    }
  });

  function run(command: PrsiCommand) {
    const r = applyPrsi(game, { ...command, by: { role: 'contestant', contestantId: me }, now: Date.now() });
    if (r.ok) game = r.state;
    else message = { pose: 'premysli', text: errorText(r.error) };
  }

  function tap(id: string) {
    if (!myTurn) {
      message = { pose: 'premysli', text: 'Počkej, teď hraje někdo jiný.' };
      return;
    }
    const error = playError(game, me, id);
    if (error) {
      message = { pose: 'premysli', text: setup.hints ? explainCard(game, me, id) : errorText(error) };
      return;
    }
    if (mariasCard(id).rank === 'svrsek') {
      picking = id;
      return;
    }
    run({ type: 'play', cardId: id });
  }

  function chooseSuit(suit: MariasSuit) {
    const id = picking;
    picking = null;
    if (id) run({ type: 'play', cardId: id, suit });
  }

  function fallbackAction() {
    run(fallback === 'stand' ? { type: 'stand' } : { type: 'draw' });
  }

  function advise() {
    advice = choosePrsiMove(game, me, 3);
    message = { pose: 'otazka', text: advice.reason };
  }

  function nextDeal() {
    const r = applyPrsi(game, { type: 'nextDeal', by: { role: 'contestant', contestantId: me }, now: Date.now() });
    if (r.ok) game = r.state;
  }

  function again() {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    game = createPrsiGame({
      id: `trenink-prsi-${seed}`,
      createdAt: new Date().toISOString(),
      seed,
      players: game.players,
      settings: game.settings,
      now: Date.now(),
    });
  }

  const summary = $derived(prsiSummary(game.sheet));
  const lastOrder = $derived(game.sheet.deals[game.sheet.deals.length - 1]?.order ?? []);
  const advised = $derived(advice?.move.type === 'play' ? [advice.move.cardId] : []);
  const fallbackLabel = $derived(fallback === 'stand' ? 'Stojím' : fallback === 'drawPenalty' ? `Vzít ${penaltyCards(game)} karty` : 'Líznout si');
</script>

<div class="table" data-testid="prsi-table" data-phase={game.phase} data-turn={game.turn} data-my-cards={hand.length}>
  <header class="top-bar">
    <a class="btn small ghost" href="/trenink/prsi">← Zpět</a>
    <strong>Prší{game.settings.deals > 1 ? ` · partie ${game.dealIndex + 1}/${game.settings.deals}` : ''}</strong>
    <button type="button" class="btn small ghost" onclick={() => (rulesOpen = true)}>Pravidla</button>
  </header>

  <section class="opponents" aria-label="Soupeři">
    {#each opponents as p (p.id)}
      {@const place = game.out.indexOf(p.id)}
      <div class="opponent" class:turn={game.turn === p.id && game.phase === 'playing'} data-testid="opponent">
        <div class="name">{p.name} <span class="muted small">{p.ai ? LEVEL_LABELS[p.ai] : ''}</span></div>
        <div class="backs" aria-label="{(game.hands[p.id] ?? []).length} karet">
          {#each game.hands[p.id] ?? [] as _, i (i)}
            <span class="back" style="margin-left:{i ? -30 : 0}px"><Card faceDown width={38} /></span>
          {/each}
          {#if place >= 0}<span class="badge lavice">{place + 1}. místo</span>{/if}
        </div>
      </div>
    {/each}
  </section>

  <section class="center">
    <button type="button" class="stock" onclick={fallbackAction} disabled={!myTurn} aria-label="Balíček: {fallbackLabel}">
      <Card faceDown width={86} />
      <span class="muted small">{game.stock.length} v balíčku</span>
    </button>
    <div class="discard" data-testid="discard" data-top={top}>
      {#key game.discard.length}
        <div class="drop"><Card id={top} width={96} /></div>
      {/key}
      <span class="suit-chip" data-testid="suit">
        {#if game.pendingSevens > 0}Sedma: bere se {penaltyCards(game)}{:else if game.pendingAce}Eso: stojí se{:else if mariasCard(top).rank === 'svrsek'}Přeje si: {MARIAS_SUIT_LABELS[game.suit]}{:else}{MARIAS_SUIT_LABELS[game.suit]}{/if}
      </span>
    </div>
  </section>

  <section class="helper">
    <Owl pose={owl.pose} text={owl.text} compact />
  </section>

  <section class="mine">
    <Hand cards={hand} playable={setup.hints && myTurn ? playable : null} {advised} disabled={!myTurn} onTap={tap} />
    <div class="row actions">
      <button type="button" class="btn" data-testid="fallback" disabled={!myTurn} onclick={fallbackAction}>{fallbackLabel}</button>
      {#if setup.hints}
        <button type="button" class="btn clay" disabled={!myTurn} onclick={advise}>Poraď</button>
      {/if}
    </div>
  </section>

  {#if picking}
    <div class="overlay" role="dialog" aria-modal="true" aria-label="Vyber barvu">
      <div class="card stack">
        <h2>Jakou barvu si přeješ?</h2>
        <div class="row suits">
          {#each MARIAS_SUITS as suit (suit)}
            <button type="button" class="btn suit-btn" data-testid="suit-choice" onclick={() => chooseSuit(suit)}>
              <Card id="{suit}-eso" width={52} label={MARIAS_SUIT_LABELS[suit]} />
              {MARIAS_SUIT_LABELS[suit]}
            </button>
          {/each}
        </div>
        <button type="button" class="btn ghost small" onclick={() => (picking = null)}>Zpět</button>
      </div>
    </div>
  {/if}

  {#if game.phase === 'dealEnd' || game.phase === 'finished'}
    <div class="overlay" role="dialog" aria-modal="true" aria-label="Výsledek">
      <div class="card stack result" data-testid="result">
        <Owl pose="slavi" text={lastOrder[0] === me ? 'Vyhrál jsi! Skvělá hra!' : `Vyhrál ${playerName(game, lastOrder[0] ?? '')}. Příště to vyjde tobě!`} />
        <ol>
          {#each lastOrder as id (id)}<li>{playerName(game, id)}</li>{/each}
        </ol>
        {#if game.settings.deals > 1}
          <table class="sheet">
            <thead><tr><th>Hráč</th><th>Součet míst</th><th>Výhry</th></tr></thead>
            <tbody>
              {#each summary as row (row.playerId)}
                <tr><td>{row.place}. {playerName(game, row.playerId)}</td><td>{row.placeSum}</td><td>{row.wins}</td></tr>
              {/each}
            </tbody>
          </table>
        {/if}
        <div class="row">
          {#if game.phase === 'dealEnd'}
            <button type="button" class="btn primary big" onclick={nextDeal}>Další partie</button>
          {:else}
            <button type="button" class="btn primary big" onclick={again}>Hrát znovu</button>
            <a class="btn" href="/trenink/prsi">Zpět na trénink</a>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <RulesSheet game="prsi" bind:open={rulesOpen} />
</div>

<style>
  .table {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto auto 1fr auto auto;
    gap: 10px;
    padding: max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
    background: radial-gradient(ellipse at 50% 45%, #e6ecdc 0%, #d5dfc9 60%, #c9d5bb 100%);
  }
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .opponents {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
  }
  .opponent {
    background: rgba(251, 248, 241, 0.75);
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    min-width: 150px;
  }
  .opponent.turn {
    border-color: var(--clay);
    box-shadow: 0 0 0 3px var(--clay-light);
  }
  .name {
    font-weight: 750;
  }
  .small {
    font-size: 0.85rem;
  }
  .backs {
    display: flex;
    align-items: center;
    min-height: 60px;
  }
  .center {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 40px;
  }
  .stock {
    border: 0;
    background: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .stock:disabled {
    opacity: 1;
  }
  .discard {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .drop {
    animation: drop 260ms ease-out;
  }
  @keyframes drop {
    from {
      transform: translateY(40px) scale(0.9);
      opacity: 0.4;
    }
  }
  .suit-chip {
    background: var(--paper);
    border: 2px solid var(--line);
    border-radius: 999px;
    padding: 2px 12px;
    font-weight: 700;
  }
  .helper {
    max-width: 760px;
    width: 100%;
    margin: 0 auto;
  }
  .actions {
    justify-content: center;
    margin-top: 8px;
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(59, 51, 43, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 30;
    padding: 16px;
  }
  .overlay > .card {
    width: min(620px, 100%);
    max-height: calc(100vh - 32px);
    overflow: auto;
  }
  .suits {
    justify-content: center;
  }
  .suit-btn {
    flex-direction: column;
    min-width: 110px;
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
  @media (prefers-reduced-motion: reduce) {
    .drop {
      animation: none;
    }
  }
  @media (orientation: portrait) {
    .center {
      gap: 24px;
    }
  }
</style>
