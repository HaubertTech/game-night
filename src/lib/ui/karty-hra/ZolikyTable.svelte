<script lang="ts">
  // Žolíky table: opponents on top, laid-down combinations in the middle, stock and discard pile,
  // own hand at the bottom. Cards are selected by tapping; selected cards form a group, are laid
  // off by tapping a combination on the table, or discarded. The score sheet is the same arch as
  // for physical cards.
  import { page } from '$app/state';
  import { zolikyRanking } from '#lib/cards/zoliky.ts';
  import { zolikyAiStep } from '#lib/games/karty-hra/ai/autoplay.ts';
  import { chooseZolikyCommand, suggestMelds } from '#lib/games/karty-hra/ai/zoliky-ai.ts';
  import { frenchCardName } from '#lib/games/karty-hra/cards.ts';
  import type { OwlPose } from '#lib/games/karty-hra/learn/lessons.ts';
  import {
    applyZoliky,
    createZolikyGame,
    errorText,
    playerName,
    topDiscard,
    viewFor,
    type ZolikyCommand,
    type ZolikyGameState,
  } from '#lib/games/karty-hra/zoliky-engine.ts';
  import { MELD_ERROR_TEXT, analyzeMeld, checkOpening, meldValue, swapJoker } from '#lib/games/karty-hra/zoliky-melds.ts';
  import Card from './Card.svelte';
  import Hand from './Hand.svelte';
  import Owl from '#lib/ui/art/Owl.svelte';
  import RulesSheet from './RulesSheet.svelte';
  import { LEVEL_LABELS, saveGame, type SavedGame } from './storage.ts';

  let { saved }: { saved: SavedGame<ZolikyGameState> } = $props();

  const me = 'ja';
  const setup = $derived(saved.setup);
  // svelte-ignore state_referenced_locally
  let game: ZolikyGameState = $state(saved.state);
  let selected: string[] = $state([]);
  let staged: string[][] = $state([]);
  let highlight: string[] = $state([]);
  let message: { pose: OwlPose; text: string } | null = $state(null);
  let rulesOpen = $state(false);
  let sheetOpen = $state(false);
  const fast = $derived(page.url.searchParams.has('rychle'));
  const kid = $derived(setup.audience === 'kid');

  const view = $derived(viewFor(game, { role: 'contestant', contestantId: me }));
  const myTurn = $derived(game.phase === 'playing' && game.turn === me);
  const opened = $derived(!!game.opened[me]);
  const stagedSet = $derived(new Set(staged.flat()));
  const hand = $derived((game.hands[me] ?? []).filter((c) => !stagedSet.has(c)));
  const top = $derived(topDiscard(game));
  const opponents = $derived(view.players.filter((p) => p.id !== me));

  // Computer seats: one command per tick.
  $effect(() => {
    if (game.phase !== 'playing' || game.turn === me) return;
    const current = game;
    const timer = setTimeout(() => {
      game = zolikyAiStep(current, Date.now());
    }, fast ? 30 : current.step === 'draw' ? 700 : 600);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    saveGame('zoliky', { setup: $state.snapshot(setup), state: $state.snapshot(game) as ZolikyGameState });
  });

  // Leaving the own turn clears the selection.
  let lastTurnKey = '';
  $effect(() => {
    const key = `${game.roundIndex}:${game.turn}:${game.step}`;
    if (key !== lastTurnKey) {
      lastTurnKey = key;
      if (!myTurn || game.step === 'draw') {
        selected = [];
        staged = [];
      }
      highlight = [];
      message = null;
    }
  });

  const stagedPoints = $derived(
    staged.reduce((sum, g) => {
      const a = analyzeMeld(g);
      return sum + (a.ok ? meldValue(a.shape, game.settings.values) : 0);
    }, 0),
  );
  const stagedCheck = $derived(checkOpening(staged, { min: game.settings.openingMin, requirePureRun: game.settings.requirePureRun, values: game.settings.values }));

  const commentary = $derived.by((): { pose: OwlPose; text: string } => {
    if (game.phase !== 'playing') return { pose: 'slavi', text: 'Kolo skončilo.' };
    const last = game.log[game.log.length - 1];
    let lastText = '';
    if (last && 'playerId' in last && last.playerId !== me) {
      const who = playerName(game, last.playerId);
      if (last.type === 'discard') lastText = `${who} odhodil(a) ${frenchCardName(last.cardId)}. `;
      else if (last.type === 'takeDiscard') lastText = `${who} si vzal(a) ${frenchCardName(last.cardId)} z odhozených. `;
      else if (last.type === 'meld') lastText = `${who} vykládá${last.opening ? ' poprvé' : ''}. `;
      else if (last.type === 'layOff') lastText = `${who} přikládá. `;
      else if (last.type === 'swapJoker') lastText = `${who} vyměnil(a) žolíka. `;
    }
    if (!myTurn) return { pose: 'premysli', text: `${lastText}Hraje ${playerName(game, game.turn)}…` };
    if (game.step === 'draw') {
      return {
        pose: 'otazka',
        text: `${lastText}Jsi na řadě. Vezmi si kartu z balíčku${top ? ', nebo horní kartu z odhozených' : ''}.${kid && !opened && top ? ' Z odhozených jen tehdy, když s ní hned vyložíš.' : ''}`,
      };
    }
    if (!setup.hints) return { pose: 'otazka', text: 'Vykládej, nebo vyber jednu kartu a odhoď ji.' };
    if (!opened) {
      return {
        pose: 'otazka',
        text: kid
          ? `Vyber karty a dej je „Do skupiny“. Poprvé potřebuješ ${game.settings.openingMin} bodů a čistou postupku. Nevíš? Klepni na „Najdi kombinace“. Nakonec jednu kartu odhoď.`
          : `První vyložení: ${game.settings.openingMin} bodů + čistá postupka. Jinak odhoď kartu.`,
      };
    }
    return {
      pose: 'otazka',
      text: kid
        ? 'Vykládej nové skupiny, nebo vyber kartu a klepni na skupinu na stole — přiložíš ji. Nakonec jednu kartu odhoď.'
        : 'Vykládej, přikládej, nakonec odhoď.',
    };
  });
  const owl = $derived(message ?? commentary);

  function run(command: ZolikyCommand): boolean {
    const r = applyZoliky(game, { ...command, by: { role: 'contestant', contestantId: me }, now: Date.now() });
    if (r.ok) {
      game = r.state;
      message = null;
      highlight = [];
      return true;
    }
    message = { pose: 'premysli', text: errorText(r.error, r.detail) };
    return false;
  }

  function toggle(id: string) {
    if (!myTurn) return;
    if (game.step === 'draw') {
      message = { pose: 'premysli', text: errorText('drawFirst') };
      return;
    }
    selected = selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id];
  }

  function stage() {
    const check = analyzeMeld(selected);
    if (!check.ok) {
      message = { pose: 'premysli', text: MELD_ERROR_TEXT[check.error] };
      return;
    }
    staged = [...staged, selected];
    selected = [];
    message = { pose: 'slavi', text: check.shape.kind === 'run' ? 'Postupka je připravená.' : 'Trojice je připravená.' };
  }

  function meld() {
    if (run({ type: 'meld', melds: staged })) staged = [];
  }

  function attach(meldId: string) {
    if (!myTurn || game.step !== 'play') return;
    if (selected.length === 0) {
      message = { pose: 'otazka', text: 'Nejdřív vyber v ruce kartu, kterou chceš přiložit.' };
      return;
    }
    const target = game.melds.find((m) => m.id === meldId);
    const command: ZolikyCommand =
      target && swapJoker(target, selected).ok ? { type: 'swapJoker', meldId, cardIds: selected } : { type: 'layOff', meldId, cardIds: selected };
    if (run(command)) selected = [];
  }

  function discard() {
    if (selected.length !== 1) {
      message = { pose: 'otazka', text: 'Vyber jednu kartu, kterou odhodíš.' };
      return;
    }
    if (staged.length) {
      message = { pose: 'otazka', text: 'Máš připravené skupiny — nejdřív je vylož, nebo je vrať.' };
      return;
    }
    if (run({ type: 'discard', cardId: selected[0] })) selected = [];
  }

  function reset() {
    staged = [];
    selected = [];
    run({ type: 'resetTurn' });
  }

  function findCombos() {
    const { plan, opening } = suggestMelds(game, me);
    if (!opened) {
      if (!opening) {
        message = {
          pose: 'premysli',
          text: plan.melds.length
            ? `Kombinace máš za ${plan.value} bodů, na první vyložení potřebuješ ${game.settings.openingMin} a čistou postupku. Ještě sbírej.`
            : 'Zatím žádnou kombinaci nemáš. Sbírej karty, které jdou po sobě nebo mají stejné číslo.',
        };
        return;
      }
      staged = opening.melds;
      selected = [];
      message = { pose: 'slavi', text: `Našla jsem ${opening.melds.length} ${opening.melds.length === 1 ? 'skupinu' : 'skupiny'} za ${opening.value} bodů. Klepni na „Vyložit“.` };
      return;
    }
    if (!plan.melds.length) {
      message = { pose: 'premysli', text: 'Novou skupinu nemáš. Zkus přiložit kartu ke skupině na stole.' };
      return;
    }
    staged = plan.melds;
    selected = [];
    message = { pose: 'slavi', text: 'Tady jsou skupiny, které můžeš vyložit. Klepni na „Vyložit“.' };
  }

  function advise() {
    const advice = chooseZolikyCommand(game, me, 3);
    const c = advice.command;
    highlight = c.type === 'discard' ? [c.cardId] : c.type === 'meld' ? c.melds.flat() : c.type === 'layOff' || c.type === 'swapJoker' ? c.cardIds : [];
    message = { pose: 'otazka', text: advice.reason };
  }

  function nextRound() {
    run({ type: 'nextRound' });
  }

  function again() {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    game = createZolikyGame({ id: `trenink-zoliky-${seed}`, createdAt: new Date().toISOString(), seed, players: game.players, settings: game.settings, now: Date.now() });
  }

  const ranking = $derived(zolikyRanking(game.sheet));
</script>

<div class="table" data-testid="zoliky-table" data-phase={game.phase} data-turn={game.turn} data-step={game.step} data-opened={opened ? 'true' : 'false'}>
  <header class="top-bar">
    <a class="btn small ghost" href="/trenink/zoliky">← Žolíky</a>
    <strong>Žolíky · kolo {game.roundIndex + 1}/{game.settings.rounds}</strong>
    <div class="row tight">
      <button type="button" class="btn small ghost" onclick={() => (sheetOpen = !sheetOpen)}>Arch</button>
      <button type="button" class="btn small ghost" onclick={() => (rulesOpen = true)}>Pravidla</button>
    </div>
  </header>

  <section class="opponents" aria-label="Soupeři">
    {#each opponents as p (p.id)}
      <div class="opponent" class:turn={game.turn === p.id && game.phase === 'playing'}>
        <div class="name">{p.name} <span class="muted small">{p.ai ? LEVEL_LABELS[p.ai] : ''}</span></div>
        <div class="muted small">{p.cards} karet · {p.opened ? 'vyloženo' : 'nevyloženo'} · {p.total} b.</div>
        <div class="backs">
          {#each Array.from({ length: Math.min(p.cards, 16) }) as _, i (i)}
            <span style="margin-left:{i ? -28 : 0}px"><Card faceDown back={i % 2 ? 'french-1' : 'french-0'} width={32} /></span>
          {/each}
        </div>
      </div>
    {/each}
  </section>

  <section class="board">
    <div class="piles">
      <button type="button" class="pile" disabled={!myTurn || game.step !== 'draw'} onclick={() => run({ type: 'drawStock' })} aria-label="Líznout z balíčku">
        <Card faceDown back="french-0" width={74} />
        <span class="muted small">Balíček ({game.stock.length})</span>
      </button>
      <button type="button" class="pile" disabled={!myTurn || game.step !== 'draw' || !top} onclick={() => run({ type: 'takeDiscard' })} aria-label="Vzít z odhozených" data-testid="discard">
        {#if top}<Card id={top} width={74} />{:else}<span class="empty">Odhozené</span>{/if}
        <span class="muted small">Odhozené</span>
      </button>
    </div>
    <div class="melds" aria-label="Vyložené kombinace">
      {#each game.melds as m (m.id)}
        <button type="button" class="meld" onclick={() => attach(m.id)} disabled={!myTurn || game.step !== 'play'} aria-label="Skupina hráče {playerName(game, m.owner)}" data-testid="table-meld">
          <span class="owner muted small">{playerName(game, m.owner)}</span>
          <span class="meld-cards">
            {#each m.slots as s, i (s.id)}
              <span style="margin-left:{i ? -22 : 0}px"><Card id={s.id} width={44} /></span>
            {/each}
          </span>
        </button>
      {:else}
        <p class="muted">Na stole zatím nic není.</p>
      {/each}
    </div>
  </section>

  <section class="helper">
    <Owl pose={owl.pose} text={owl.text} compact />
  </section>

  <section class="mine">
    {#if staged.length}
      <div class="staged" data-testid="staged">
        {#each staged as g, i (i)}
          <span class="meld-cards">
            {#each g as id, j (id)}<span style="margin-left:{j ? -20 : 0}px"><Card {id} width={42} /></span>{/each}
          </span>
        {/each}
        {#if !opened}
          <span class="counter" data-testid="opening-points">
            {stagedPoints} / {game.settings.openingMin} bodů · čistá postupka {stagedCheck.hasPureRun ? 'ano' : 'ne'}
          </span>
        {/if}
      </div>
    {/if}
    <Hand cards={hand} {selected} advised={highlight} disabled={!myTurn} onTap={toggle} />
    <div class="row actions">
      {#if myTurn && game.step === 'draw'}
        <button type="button" class="btn primary" onclick={() => run({ type: 'drawStock' })}>Z balíčku</button>
        <button type="button" class="btn" disabled={!top} onclick={() => run({ type: 'takeDiscard' })}>Z odhozených</button>
      {:else}
        <button type="button" class="btn" disabled={!myTurn || selected.length < 3} onclick={stage}>Do skupiny</button>
        <button type="button" class="btn primary" disabled={!myTurn || staged.length === 0} onclick={meld}>Vyložit</button>
        <button type="button" class="btn clay" disabled={!myTurn || selected.length !== 1} onclick={discard}>Odhodit</button>
        {#if staged.length}
          <button type="button" class="btn ghost" onclick={() => (staged = [])}>Vrátit skupiny</button>
        {/if}
        {#if view.canReset}
          <button type="button" class="btn ghost" onclick={reset}>Vrátit tah</button>
        {/if}
      {/if}
      {#if setup.hints}
        <button type="button" class="btn ghost" disabled={!myTurn || game.step !== 'play'} onclick={findCombos}>Najdi kombinace</button>
        <button type="button" class="btn clay" disabled={!myTurn} onclick={advise}>Poraď</button>
      {/if}
    </div>
  </section>

  {#if sheetOpen || game.phase !== 'playing'}
    <div class="overlay" role="dialog" aria-modal="true" aria-label="Arch">
      <div class="card stack" data-testid="result">
        {#if game.phase === 'roundEnd' && game.lastRound}
          <Owl
            pose="slavi"
            text={`${game.lastRound.winnerId === me ? 'Zavřel jsi!' : `Zavřel(a) ${playerName(game, game.lastRound.winnerId)}.`}${game.lastRound.fromHand ? ' Z ruky — ostatní mají body dvakrát!' : ''}`}
          />
        {:else if game.phase === 'finished'}
          <Owl pose={ranking[0]?.playerId === me ? 'slavi' : 'mava'} text={ranking[0]?.playerId === me ? 'Vyhrál(a) jsi celou hru, máš nejméně bodů.' : `Vyhrál(a) ${playerName(game, ranking[0]?.playerId ?? '')}.`} />
        {/if}
        <div class="sheet-wrap">
          <table class="sheet">
            <thead>
              <tr><th>Kolo</th>{#each game.players as p (p.id)}<th>{p.name}</th>{/each}</tr>
            </thead>
            <tbody>
              {#each view.rows as row, i (i)}
                <tr>
                  <td>{i + 1}</td>
                  {#each game.players as p (p.id)}<td>{row.scores[p.id] ?? 0} <span class="muted small">({row.totals[p.id] ?? 0})</span></td>{/each}
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr><th>Součet</th>{#each view.players as p (p.id)}<th>{p.total}</th>{/each}</tr>
            </tfoot>
          </table>
        </div>
        <div class="row">
          {#if game.phase === 'roundEnd'}
            <button type="button" class="btn primary big" onclick={nextRound}>Další kolo</button>
          {:else if game.phase === 'finished'}
            <button type="button" class="btn primary big" onclick={again}>Hrát znovu</button>
            <a class="btn" href="/trenink/zoliky">Zpět na trénink</a>
          {:else}
            <button type="button" class="btn" onclick={() => (sheetOpen = false)}>Zavřít</button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <RulesSheet game="zoliky" bind:open={rulesOpen} />
</div>

<style>
  .table {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto auto 1fr auto auto;
    gap: 8px;
    padding: max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
    background: radial-gradient(ellipse at 50% 45%, #e3e9ef 0%, #d3dce5 60%, #c5d0db 100%);
  }
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tight {
    gap: 6px;
  }
  .opponents {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
  }
  .opponent {
    background: rgba(251, 248, 241, 0.8);
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    min-width: 160px;
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
    min-height: 50px;
    align-items: center;
  }
  .board {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    min-height: 0;
  }
  .piles {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pile {
    border: 0;
    background: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .pile:disabled {
    opacity: 1;
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 74px;
    height: 111px;
    border: 2px dashed var(--line);
    border-radius: 9px;
    font-size: 0.8rem;
  }
  .melds {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-content: flex-start;
    max-height: 46vh;
    overflow: auto;
  }
  .meld {
    background: rgba(251, 248, 241, 0.7);
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 4px 8px 6px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .meld:disabled {
    opacity: 1;
    cursor: default;
  }
  .meld:not(:disabled):hover {
    border-color: var(--sage);
  }
  .meld-cards {
    display: flex;
  }
  .helper {
    max-width: 820px;
    width: 100%;
    margin: 0 auto;
  }
  .staged {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: center;
    background: rgba(251, 248, 241, 0.7);
    border: 2px dashed var(--sage);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
  }
  .counter {
    font-weight: 750;
  }
  .actions {
    justify-content: center;
    margin-top: 6px;
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
    width: min(760px, 100%);
    max-height: calc(100vh - 32px);
    overflow: auto;
  }
  .sheet-wrap {
    overflow-x: auto;
  }
  .sheet {
    border-collapse: collapse;
    width: 100%;
  }
  .sheet th,
  .sheet td {
    border-bottom: 1px solid var(--line);
    padding: 5px 8px;
    text-align: right;
    white-space: nowrap;
  }
  .sheet th:first-child,
  .sheet td:first-child {
    text-align: left;
  }
  @media (orientation: portrait) {
    .board {
      flex-direction: column;
    }
    .piles {
      flex-direction: row;
      align-self: center;
    }
  }
</style>
