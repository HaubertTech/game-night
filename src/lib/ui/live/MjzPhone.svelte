<script lang="ts">
  import Celebrate from './Celebrate.svelte';
  import LobbyBackdrop from '#lib/ui/live/LobbyBackdrop.svelte';
  import Art from '#lib/ui/art/Art.svelte';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import './game.css';
  import type { MjzCommand } from '../../games/mjz/engine.ts';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import Standings from '../Standings.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import Countdown from './Countdown.svelte';
  import MjzSheet from './MjzSheet.svelte';
  import SeatPicker from './SeatPicker.svelte';
  import { mjzKnownLabel, mjzReviewable, mjzStandingRows, mjzVerdictLabel } from './game-helpers.ts';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.mjz);
  const byId = $derived(new Map((view?.contestants ?? []).map((c) => [c.id, c])));
  const me = $derived(room.me ? byId.get(room.me) : undefined);
  const seats = $derived((view?.contestants ?? []).filter((c) => !c.kicked).map((c) => ({ id: c.id, name: c.name, avatar: c.avatar, level: c.level })));
  const myCategories = $derived((view?.categories ?? []).filter((c) => view?.myCategories.includes(c.id)));
  const focusCat = $derived(view ? view.categories[view.focus] : undefined);
  const focusAnswers = $derived(view?.answers?.filter((a) => a.categoryId === focusCat?.id) ?? []);
  const myLeft = $derived(room.secondsUntil(view?.myDeadline ?? null));
  const act = (command: MjzCommand) => room.actMjz(command);
</script>

<main class="g-phone" data-testid="phone" data-game="mjz" data-phase={view?.phase ?? 'loading'} data-me={room.me ?? ''}>
  <header class="g-bar">
    {#if me}
      <span><span class="emoji"><Avatar value={me.avatar} /></span> <strong>{me.name}</strong></span>
      <span class="score" data-testid="my-score">{me.score} b.</span>
    {:else}
      <span>✍️ Místnost <strong>{code}</strong></span>
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
  {:else if view.phase === 'finished'}
    <section class="stack" data-testid="final">
      <Celebrate size={100} />
      <h1 class="g-center">Konečné pořadí</h1>
      <Standings rows={mjzStandingRows(view)} showRound={false} />
    </section>
  {:else if !me}
    <SeatPicker {seats} presence={room.presence} onPick={(id) => room.join(id)} />
  {:else if me.kicked}
    <section class="stack g-center"><h1>Hostitel tě ze hry odebral</h1></section>
  {:else if view.phase === 'setup'}
    <LobbyBackdrop kind="phone" />
    <section class="g-wait-card stack g-center" data-testid="waiting">
      <div class="emoji g-huge"><Avatar value={me.avatar} px={192} /></div>
      <h1>Jsi ve hře!</h1>
      <p class="muted">Čekáme, až hostitel spustí hru na televizi.</p>
      <button class="btn small ghost" onclick={() => room.leave()}>Nejsem {me.name}</button>
    </section>
  {:else if view.phase === 'letter'}
    <section class="stack g-center" data-testid="letter">
      <p class="muted">Kolo {view.roundIndex + 1} z {view.roundCount}</p>
      <p class="g-mega letter">{view.letter}</p>
      <h1>Připrav se, za chvíli se píše!</h1>
    </section>
  {:else if view.phase === 'writing'}
    <section class="stack">
      <div class="row head">
        <span class="letter-small" data-testid="phone-letter">{view.letter}</span>
        <div class="g-grow"><Countdown seconds={me.done ? null : myLeft} total={view.settings.timeSeconds} /></div>
      </div>
      {#if view.stoppedBy && !me.done}
        <p class="g-note" data-testid="stopped">🛑 STOP! zmáčkl(a) {byId.get(view.stoppedBy)?.name} — rychle dopiš!</p>
      {/if}
      {#if me.done}
        <div class="stack g-center" data-testid="sent">
          <Art name="mascot.sova-premysli" alt="Sova přemýšlí" size={140} style="width:140px;height:140px;margin:0 auto" />
          <h1>Odevzdáno</h1>
          <p class="muted">Čekáme na ostatní.</p>
        </div>
      {:else}
        {#key `${view.roundIndex}/${view.letter}`}
          <MjzSheet
            categories={myCategories}
            sheet={view.sheets[me.id] ?? {}}
            letter={view.letter}
            onWrite={(answers) => act({ type: 'write', answers })}
            onStop={() => act({ type: 'stop' })}
            onDone={() => act({ type: 'done' })}
          />
        {/key}
      {/if}
    </section>
  {:else if view.phase === 'review' && view.answers}
    <section class="stack" data-testid="mjz-review">
      <h1 class="g-center">{focusCat?.label} na {view.letter}</h1>
      <p class="muted g-center">Kategorii přepíná televize. Odpověď, která podle tebe neplatí, napadni.</p>
      <ul class="answers">
        {#each focusAnswers as a (a.contestantId)}
          {@const c = byId.get(a.contestantId)}
          {@const mine = a.contestantId === me.id}
          <li data-testid="mjz-answer" data-contestant={a.contestantId} data-category={a.categoryId} data-verdict={a.verdict}>
            <div class="row line">
              <span class="emoji"><Avatar value={c?.avatar} /></span>
              <strong class="g-grow">{mine ? 'Ty' : c?.name}: {a.text || '—'}</strong>
              <span class="points">{a.points} b.</span>
            </div>
            <div class="row meta">
              <span>{mjzVerdictLabel(a)}</span>
              {#if a.known !== null && a.text}<span>{mjzKnownLabel(a.known)}</span>{/if}
              {#if a.challenged}<span>👍 {a.votesValid} · 👎 {a.votesInvalid}</span>{/if}
            </div>
            {#if !mine && mjzReviewable(a) && a.ruling === null}
              {#if !a.challenged}
                <button class="btn small" onclick={() => act({ type: 'challenge', contestantId: a.contestantId, categoryId: a.categoryId })} aria-label={`Napadnout: ${c?.name}`}>⚖️ Napadnout</button>
              {:else}
                <div class="row" role="group" aria-label={`Hlas: ${c?.name}`}>
                  <button class="btn small" aria-pressed={a.myVote === true} onclick={() => act({ type: 'vote', contestantId: a.contestantId, categoryId: a.categoryId, valid: true })}>👍 Platí</button>
                  <button class="btn small" aria-pressed={a.myVote === false} onclick={() => act({ type: 'vote', contestantId: a.contestantId, categoryId: a.categoryId, valid: false })}>👎 Neplatí</button>
                </div>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {:else if view.phase === 'roundEnd'}
    <section class="stack">
      <h1 class="g-center">Po {view.roundIndex + 1}. kole</h1>
      <p class="g-center"><strong>Za kolo: {view.lastResult?.points[me.id] ?? 0} b.</strong></p>
      <Standings rows={mjzStandingRows(view)} />
    </section>
  {/if}

  {#if room.error && room.status !== 'failed'}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
</main>

<style>
  .score {
    font-weight: 800;
  }
  .letter {
    color: var(--clay-dark);
  }
  .letter-small {
    font-size: 3rem;
    font-weight: 900;
    color: var(--clay-dark);
    min-width: 1.4em;
    text-align: center;
  }
  .head {
    flex-wrap: nowrap;
  }
  .answers {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .answers li {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: var(--paper);
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .answers li[data-verdict='invalid'],
  .answers li[data-verdict='wrongLetter'] {
    background: var(--bad-bg);
  }
  .line {
    font-size: 1.2rem;
    flex-wrap: nowrap;
  }
  .meta {
    font-size: 0.95rem;
    gap: 4px 12px;
  }
  .points {
    font-weight: 900;
  }
  .answers :global(.btn[aria-pressed='true']) {
    background: var(--sage-light);
    border-color: var(--sage-dark);
  }
</style>
