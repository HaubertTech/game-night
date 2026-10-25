<script lang="ts">
  // Digital žolíky on a phone: the own hand and the combinations on the table. Take a card, select
  // cards and put them into groups, lay them down, tap a combination on the table to add the
  // selected cards (or swap a joker), and finally discard one card. Children with hints can let
  // the owl find combinations or advise the next step.
  import './game.css';
  import { MELD_ERROR_TEXT, analyzeMeld, checkOpening, meldValue, swapJoker } from '../../games/karty-hra/zoliky-melds.ts';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import Card from '../karty-hra/Card.svelte';
  import Hand from '../karty-hra/Hand.svelte';
  import Owl from '../karty-hra/Owl.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import Countdown from './Countdown.svelte';
  import SeatPicker from './SeatPicker.svelte';
  import ZolikySheetTable from './ZolikySheetTable.svelte';
  import { recentZoliky, seatName, zolikyStandings } from './card-helpers.ts';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.zoliky);
  const people = $derived((view?.seats ?? []).filter((s) => !s.ai));
  const me = $derived(room.me ? view?.seats.find((s) => s.id === room.me) : undefined);
  const myTurn = $derived(!!view && !!me && view.roomPhase !== 'lobby' && view.phase === 'playing' && view.turn === me.id);
  const opened = $derived(!!view?.players.find((p) => p.id === me?.id)?.opened);
  const hints = $derived(!!me?.hints);
  const others = $derived((view?.players ?? []).filter((p) => p.id !== me?.id));
  const recent = $derived(view ? recentZoliky(view, 2) : []);

  let selected = $state<string[]>([]);
  let staged = $state<string[][]>([]);
  let highlight = $state<string[]>([]);
  let note = $state<string | null>(null);
  let sheetOpen = $state(false);

  const stagedSet = $derived(new Set(staged.flat()));
  const hand = $derived((view?.hand ?? []).filter((c) => !stagedSet.has(c)));
  const values = $derived(view?.settings.values);
  const stagedPoints = $derived(
    staged.reduce((sum, g) => {
      const a = analyzeMeld(g);
      return sum + (a.ok ? meldValue(a.shape, values) : 0);
    }, 0),
  );
  const stagedCheck = $derived(view ? checkOpening(staged, { min: view.settings.openingMin, requirePureRun: view.settings.requirePureRun, values }) : null);

  // A new turn (or a refused command) resets the local selection.
  let lastKey = '';
  $effect(() => {
    if (!view) return;
    const key = `${view.roundIndex}:${view.turn}:${view.step}`;
    if (key !== lastKey) {
      lastKey = key;
      selected = [];
      staged = [];
      highlight = [];
      note = null;
    }
  });
  // Cards that left the hand (laid down, discarded) leave the selection too.
  $effect(() => {
    const inHand = new Set(view?.hand ?? []);
    if (selected.some((c) => !inHand.has(c))) selected = selected.filter((c) => inHand.has(c));
    if (staged.some((g) => g.some((c) => !inHand.has(c)))) staged = staged.filter((g) => g.every((c) => inHand.has(c)));
  });

  const owlText = $derived.by(() => {
    if (!view) return '';
    if (note) return note;
    if (!myTurn) return `Hraje ${seatName(view.seats, view.turn)}…`;
    if (view.step === 'draw') return `Jsi na řadě. Vezmi si kartu z balíčku${view.topDiscard ? ', nebo horní kartu z odhozených' : ''}.${!opened && view.topDiscard ? ' Z odhozených jen tehdy, když s ní hned vyložíš.' : ''}`;
    if (!opened) return `Vyber karty a dej je „Do skupiny“. Poprvé potřebuješ ${view.settings.openingMin} bodů a čistou postupku. Nakonec jednu kartu odhoď.`;
    return 'Vykládej nové skupiny, nebo vyber kartu a klepni na skupinu na stole — přiložíš ji. Nakonec jednu kartu odhoď.';
  });

  function toggle(id: string) {
    if (!myTurn || !view) return;
    if (view.step === 'draw') {
      note = 'Nejdřív si vezmi kartu z balíčku nebo z odhozených.';
      return;
    }
    selected = selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id];
  }

  function stage() {
    const check = analyzeMeld(selected);
    if (!check.ok) {
      note = MELD_ERROR_TEXT[check.error];
      return;
    }
    staged = [...staged, selected];
    selected = [];
    note = check.shape.kind === 'run' ? 'Postupka je připravená.' : 'Skupina je připravená.';
  }

  function meld() {
    if (!staged.length) return;
    room.actZoliky({ type: 'meld', melds: staged });
  }

  function attach(meldId: string) {
    if (!myTurn || !view || view.step !== 'play') return;
    if (!selected.length) {
      note = 'Nejdřív vyber v ruce kartu, kterou chceš přiložit.';
      return;
    }
    const target = view.melds.find((m) => m.id === meldId);
    const swap = target && swapJoker(target, selected).ok;
    room.actZoliky(swap ? { type: 'swapJoker', meldId, cardIds: selected } : { type: 'layOff', meldId, cardIds: selected });
  }

  function discard() {
    if (selected.length !== 1) {
      note = 'Vyber jednu kartu, kterou odhodíš.';
      return;
    }
    if (staged.length) {
      note = 'Máš připravené skupiny — nejdřív je vylož, nebo je vrať.';
      return;
    }
    room.actZoliky({ type: 'discard', cardId: selected[0] });
  }

  function findCombos() {
    const h = view?.hint;
    if (!h || !view) return;
    const plan = opened ? h.melds : h.opening;
    if (!plan?.length) {
      note = opened ? 'Novou skupinu nemáš. Zkus přiložit kartu ke skupině na stole.' : `Na první vyložení zatím nemáš ${view.settings.openingMin} bodů s čistou postupkou. Ještě sbírej.`;
      return;
    }
    staged = plan.map((g) => [...g]);
    selected = [];
    note = 'Tady jsou skupiny, které můžeš vyložit. Klepni na „Vyložit“.';
  }

  function advise() {
    if (!view?.hint) return;
    highlight = view.hint.cardIds;
    note = view.hint.text;
  }
</script>

<main class="g-phone" data-testid="phone" data-game="zoliky-hra" data-phase={view?.roomPhase ?? 'loading'} data-me={room.me ?? ''} data-my-turn={myTurn ? 'yes' : 'no'} data-seq={view?.log.at(-1)?.seq ?? 0} data-step={view?.step ?? ''}>
  <header class="g-bar">
    {#if me}
      <span><span class="emoji">{me.avatar}</span> <strong>{me.name}</strong></span>
      {#if view && view.roomPhase !== 'lobby'}<button class="btn small ghost" onclick={() => (sheetOpen = !sheetOpen)}>Arch</button>{/if}
    {:else}
      <span>🂡 Místnost <strong>{code}</strong></span>
    {/if}
    <ConnectionBadge status={room.status} />
  </header>

  {#if room.status === 'failed'}
    <section class="card stack g-center">
      <h1>😕 Místnost nejde otevřít</h1>
      <p>{room.error?.message}</p>
      <a class="btn primary big" href="/m">Zadat jiný kód</a>
    </section>
  {:else if !view}
    <p class="g-center muted">Připojuji se…</p>
  {:else if !me}
    <SeatPicker seats={people} presence={room.presence} onPick={(id) => room.join(id)} />
  {:else if view.roomPhase === 'lobby'}
    <section class="stack g-center" data-testid="waiting">
      <div class="emoji g-huge">{me.avatar}</div>
      <h1>Jsi u stolu!</h1>
      <p class="muted">Čekáme, až hostitel na televizi rozdá karty.</p>
      <button class="btn small ghost" onclick={() => room.leave()}>Nejsem {me.name}</button>
    </section>
  {:else if view.phase === 'playing' && !sheetOpen}
    <section class="others" aria-label="Soupeři">
      {#each others as p (p.id)}
        <span class="other" class:turn={view.turn === p.id}>{p.name}: {p.cards} 🂠{p.opened ? ' · vyloženo' : ''}</span>
      {/each}
    </section>

    <section class="piles">
      <button type="button" class="pile" disabled={!myTurn || view.step !== 'draw'} onclick={() => room.actZoliky({ type: 'drawStock' })} aria-label="Líznout z balíčku">
        <Card faceDown back="french-0" width={58} />
        <span class="muted small">Balíček ({view.stockCount})</span>
      </button>
      <button type="button" class="pile" disabled={!myTurn || view.step !== 'draw' || !view.topDiscard} onclick={() => room.actZoliky({ type: 'takeDiscard' })} aria-label="Vzít z odhozených" data-testid="discard">
        {#if view.topDiscard}<Card id={view.topDiscard} width={58} />{:else}<span class="empty">—</span>{/if}
        <span class="muted small">Odhozené</span>
      </button>
      <div class="stack tight">{#each recent as line, i (i + line)}<span class="muted small">{line}</span>{/each}</div>
    </section>

    {#if view.melds.length}
      <section class="melds" aria-label="Vyložené kombinace">
        {#each view.melds as m (m.id)}
          <button type="button" class="meld" onclick={() => attach(m.id)} disabled={!myTurn || view.step !== 'play'} aria-label="Skupina hráče {seatName(view.seats, m.owner)}" data-testid="table-meld">
            <span class="meld-cards">
              {#each m.slots as s, i (s.id)}<span style="margin-left:{i ? -20 : 0}px"><Card id={s.id} width={34} /></span>{/each}
            </span>
          </button>
        {/each}
      </section>
    {/if}

    {#if myTurn && view.deadline}<Countdown seconds={room.remaining} total={view.turnSeconds} />{/if}

    {#if hints || note}
      <Owl pose={myTurn ? 'otazka' : 'premysli'} text={owlText} compact />
    {:else}
      <p class="status" data-testid="turn-status">{myTurn ? (view.step === 'draw' ? 'Jsi na řadě — vezmi si kartu.' : 'Vykládej, nebo odhoď kartu.') : `Hraje ${seatName(view.seats, view.turn)}…`}</p>
    {/if}

    {#if staged.length}
      <div class="staged" data-testid="staged">
        {#each staged as g, i (i)}
          <span class="meld-cards">{#each g as id, j (id)}<span style="margin-left:{j ? -18 : 0}px"><Card {id} width={34} /></span>{/each}</span>
        {/each}
        {#if !opened && stagedCheck}
          <span class="counter" data-testid="opening-points">{stagedPoints} / {view.settings.openingMin} bodů · čistá postupka {stagedCheck.hasPureRun ? 'ano' : 'ne'}</span>
        {/if}
      </div>
    {/if}

    <Hand cards={hand} {selected} advised={highlight} disabled={!myTurn} onTap={toggle} />

    <div class="row actions">
      {#if myTurn && view.step === 'draw'}
        <button type="button" class="btn primary" onclick={() => room.actZoliky({ type: 'drawStock' })}>Z balíčku</button>
        <button type="button" class="btn" disabled={!view.topDiscard} onclick={() => room.actZoliky({ type: 'takeDiscard' })}>Z odhozených</button>
      {:else}
        <button type="button" class="btn" disabled={!myTurn || selected.length < 3} onclick={stage}>Do skupiny</button>
        <button type="button" class="btn primary" disabled={!myTurn || staged.length === 0} onclick={meld}>Vyložit</button>
        <button type="button" class="btn clay" disabled={!myTurn || selected.length !== 1} onclick={discard}>Odhodit</button>
        {#if staged.length}<button type="button" class="btn ghost" onclick={() => (staged = [])}>Vrátit skupiny</button>{/if}
        {#if view.canReset}<button type="button" class="btn ghost" onclick={() => room.actZoliky({ type: 'resetTurn' })}>Vrátit tah</button>{/if}
      {/if}
      {#if hints}
        <button type="button" class="btn ghost" disabled={!myTurn || view.step !== 'play' || !view.hint} onclick={findCombos}>Najdi kombinace</button>
        <button type="button" class="btn clay" disabled={!myTurn || !view.hint} onclick={advise}>🦉 Poraď</button>
      {/if}
    </div>
  {:else}
    <section class="stack" data-testid="final">
      {#if view.phase === 'roundEnd' && view.lastRound}
        <h1 class="g-center">{view.lastRound.winnerId === me.id ? 'Zavřel(a) jsi!' : `Zavírá ${seatName(view.seats, view.lastRound.winnerId)}`}</h1>
      {:else if view.phase === 'finished'}
        {@const top = zolikyStandings(view)[0]}
        <h1 class="g-center">{top?.id === me.id ? '🏆 Vyhrál(a) jsi celou hru!' : `🏆 Vyhrává ${top?.name}`}</h1>
      {/if}
      <ZolikySheetTable {view} />
      {#if view.phase === 'roundEnd'}
        <button class="btn primary big" onclick={() => room.actZoliky({ type: 'nextRound' })}>🂡 Další kolo</button>
      {:else if view.phase === 'playing'}
        <button class="btn" onclick={() => (sheetOpen = false)}>Zpět ke hře</button>
      {:else}
        <p class="muted g-center">Výsledek je zapsaný v lize.</p>
      {/if}
    </section>
  {/if}
  {#if room.error && room.status !== 'failed'}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
</main>

<style>
  .others {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .other {
    padding: 4px 10px;
    border: 2px solid var(--line);
    border-radius: 999px;
    background: var(--paper);
    font-weight: 700;
  }
  .other.turn {
    border-color: var(--clay);
  }
  .piles {
    display: flex;
    gap: 12px;
    align-items: center;
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
    display: inline-flex;
    width: 58px;
    height: 87px;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--line);
    border-radius: 8px;
  }
  .tight {
    gap: 2px;
  }
  .small {
    font-size: 0.85rem;
  }
  .melds {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .meld {
    padding: 4px 6px;
    background: #fff;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .meld:disabled {
    opacity: 1;
  }
  .meld-cards {
    display: inline-flex;
  }
  .staged {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    padding: 6px 10px;
    border: 2px dashed var(--sage);
    border-radius: var(--radius-sm);
  }
  .counter {
    font-weight: 700;
  }
  .status {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 800;
    text-align: center;
  }
  .actions {
    justify-content: center;
  }
</style>
