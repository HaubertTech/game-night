<script lang="ts">
  import ArtIcon from '#lib/ui/live/ArtIcon.svelte';
  import { LEVEL_ART } from '#lib/ui/art/art.ts';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import './game.css';
  import type { MjzCommand } from '../../games/mjz/engine.ts';
  import { LEVEL_LABELS } from '../../types.ts';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import Standings from '../Standings.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import Countdown from './Countdown.svelte';
  import JoinPanel from './JoinPanel.svelte';
  import MjzSheet from './MjzSheet.svelte';
  import { mjzKnownLabel, mjzReviewable, mjzStandingRows, mjzVerdictLabel } from './game-helpers.ts';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.mjz);
  const isHost = $derived(view?.viewer === 'host');
  const byId = $derived(new Map((view?.contestants ?? []).map((c) => [c.id, c])));
  const active = $derived((view?.contestants ?? []).filter((c) => !c.kicked));
  const focusCat = $derived(view ? view.categories[view.focus] : undefined);
  const focusAnswers = $derived(view?.answers?.filter((a) => a.categoryId === focusCat?.id) ?? []);
  const lastRound = $derived(view ? view.roundIndex + 1 >= view.roundCount : false);
  const assisted = $derived(isHost && view?.phase === 'writing' ? active.filter((c) => c.assisted && !c.done) : []);
  const act = (command: MjzCommand) => room.actMjz(command);

  function presenceLabel(id: string, isAssisted: boolean): string {
    const p = room.presence[id];
    if (p?.online) return '📱 připojen(a)';
    if (p?.claimed) return '📴 telefon odpojen';
    return isAssisted ? '📺 píše za něj hostitel' : '⏳ čeká na telefon';
  }

  /** Categories of an assisted contestant: the keys of its sheet (level rules may drop some). */
  function categoriesOf(contestantId: string) {
    const sheet = view?.sheets[contestantId];
    return (view?.categories ?? []).filter((c) => !sheet || c.id in sheet);
  }
</script>

<main class="g-tv" data-testid="tv-mjz" data-phase={view?.phase ?? 'loading'}>
  <header class="g-bar">
    <span class="g-brand">✍️ Město, jméno, zvíře</span>
    <span>Místnost <strong>{code}</strong></span>
    {#if view && view.phase !== 'setup'}<span>Kolo {view.roundIndex + 1}/{view.roundCount}</span>{/if}
    <ConnectionBadge status={room.status} />
  </header>

  {#if room.status === 'failed'}
    <section class="card stack g-center g-narrow">
      <h1>😕 Místnost nejde otevřít</h1>
      <p>{room.error?.message}</p>
      <a class="btn primary big" href="/tv">Založit novou hru</a>
    </section>
  {:else if !view}
    <p class="g-center muted">Připojuji se k místnosti…</p>
  {:else}
    {#if !isHost}<p class="g-spectator">👀 Jen sledování — hostitelský klíč je v prohlížeči, kde se hra zakládala.</p>{/if}

    {#if view.phase === 'setup'}
      <section class="g-lobby">
        <JoinPanel {code} />
        <div class="stack">
          <h1>Kdo hraje</h1>
          <ul class="g-people">
            {#each active as c (c.id)}
              <li data-testid="lobby-contestant" data-contestant={c.id} data-online={room.presence[c.id]?.online ? 'yes' : 'no'}>
                <span class="emoji g-avatar"><Avatar value={c.avatar} px={96} /></span>
                <strong class="g-grow">{c.name}</strong>
                <span class="badge {c.level}"><ArtIcon name={LEVEL_ART[c.level]} /> {LEVEL_LABELS[c.level]}</span>
                <span class="muted">{presenceLabel(c.id, c.assisted)}</span>
              </li>
            {/each}
          </ul>
          <p class="muted">
            Kategorie: {view.categories.map((c) => c.label).join(', ')} · {view.roundCount} kol · {view.settings.timeSeconds} s na psaní{view.settings.includeCh ? ' · s Ch' : ''}{view.settings.kidsBonus ? ' · dětský bonus' : ''}
          </p>
          {#if isHost}<button class="btn primary big" onclick={() => act({ type: 'start' })}>▶️ Začít hru</button>{/if}
        </div>
      </section>
    {:else if view.phase === 'letter'}
      <section class="stack g-center g-narrow">
        <p class="muted">Písmeno {view.roundIndex + 1}. kola</p>
        <p class="g-mega letter" data-testid="mjz-letter">{view.letter}</p>
        {#if isHost}
          <div class="g-host-row">
            <button class="btn primary big" onclick={() => act({ type: 'startWriting' })}>✍️ Začít psát</button>
            <button class="btn" onclick={() => act({ type: 'redraw' })}>🔄 Jiné písmeno</button>
          </div>
        {/if}
      </section>
    {:else if view.phase === 'writing'}
      <section class="stack g-narrow">
        <div class="writing-head">
          <p class="g-mega letter" data-testid="mjz-letter">{view.letter}</p>
          <div class="g-grow stack">
            {#if view.stoppedBy}
              <p class="g-note stop" data-testid="stopped">🛑 STOP! zmáčkl(a) {byId.get(view.stoppedBy)?.name} — ostatní mají ještě chvilku</p>
            {/if}
            <Countdown seconds={room.remaining} total={view.settings.timeSeconds} />
          </div>
        </div>
        <ul class="progress">
          {#each active as c (c.id)}
            <li class:done={c.done} data-testid="mjz-progress" data-contestant={c.id} data-done={c.done ? 'yes' : 'no'}>
              <span class="emoji g-avatar"><Avatar value={c.avatar} px={96} /></span>
              <strong>{c.name}</strong>
              <span>{c.done ? '✅ odevzdáno' : `✍️ ${c.filled} z ${c.total}`}</span>
            </li>
          {/each}
        </ul>
        {#each assisted as c (c.id)}
          <div class="card stack">
            <h2><Avatar value={c.avatar} /> Píšeš za: {c.name}</h2>
            <MjzSheet
              categories={categoriesOf(c.id)}
              sheet={view.sheets[c.id] ?? {}}
              letter={view.letter}
              name={c.name}
              onWrite={(answers) => act({ type: 'write', answers, contestantId: c.id })}
              onDone={() => act({ type: 'done', contestantId: c.id })}
            />
          </div>
        {/each}
        {#if isHost}
          <div class="g-host-row"><button class="btn" onclick={() => act({ type: 'closeWriting' })}>⏹ Ukončit psaní</button></div>
        {/if}
      </section>
    {:else if view.phase === 'review' && view.answers}
      <section class="stack g-narrow" data-testid="mjz-review">
        <div class="row cats" role="group" aria-label="Kategorie">
          <span class="letter-small">{view.letter}</span>
          {#each view.categories as c, i (c.id)}
            <button class="chip" aria-pressed={view.focus === i} disabled={!isHost} onclick={() => act({ type: 'focus', index: i })}>{c.label}</button>
          {/each}
        </div>
        <h1 class="g-center">{focusCat?.label} na {view.letter}</h1>
        <ul class="answers">
          {#each focusAnswers as a (a.contestantId)}
            {@const c = byId.get(a.contestantId)}
            <li data-testid="mjz-answer" data-contestant={a.contestantId} data-category={a.categoryId} data-verdict={a.verdict} class={a.verdict}>
              <span class="emoji g-avatar"><Avatar value={c?.avatar} px={96} /></span>
              <span class="who"><strong>{c?.name}</strong></span>
              <span class="text">{a.text || '—'}</span>
              <span class="meta">
                <span>{mjzVerdictLabel(a)}</span>
                {#if a.known !== null && a.text}<span class="known">{mjzKnownLabel(a.known)}</span>{/if}
                {#if a.challenged}
                  <span class="votes" data-testid="votes">⚖️ napadl(a) {a.challengedBy === 'host' ? 'hostitel' : byId.get(a.challengedBy ?? '')?.name} · 👍 {a.votesValid} · 👎 {a.votesInvalid}</span>
                {/if}
                {#if a.sharedWith.length}<span class="muted">stejně jako {a.sharedWith.map((id) => byId.get(id)?.name).join(', ')}</span>{/if}
              </span>
              <span class="points" data-testid="points">{a.points} b.</span>
              {#if isHost && mjzReviewable(a)}
                <span class="host-buttons">
                  {#if !a.challenged && a.ruling === null}
                    <button class="btn small" onclick={() => act({ type: 'challenge', contestantId: a.contestantId, categoryId: a.categoryId })} aria-label={`Napadnout odpověď ${c?.name}`}>⚖️</button>
                  {/if}
                  <button class="btn small" aria-pressed={a.ruling === true} onclick={() => act({ type: 'rule', contestantId: a.contestantId, categoryId: a.categoryId, valid: true })} aria-label={`Uznat odpověď ${c?.name}`}>✅</button>
                  <button class="btn small" aria-pressed={a.ruling === false} onclick={() => act({ type: 'rule', contestantId: a.contestantId, categoryId: a.categoryId, valid: false })} aria-label={`Neuznat odpověď ${c?.name}`}>❌</button>
                  {#if a.ruling !== null}
                    <button class="btn small ghost" onclick={() => act({ type: 'rule', contestantId: a.contestantId, categoryId: a.categoryId, valid: null })} aria-label={`Zrušit rozhodnutí u ${c?.name}`}>↩︎</button>
                  {/if}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
        <p class="muted g-center">Sporné odpovědi napadněte na telefonu, ostatní hlasují. Hostitel má poslední slovo. 📗 = v seznamu známých, ❔ = neověřená (neznamená neplatná).</p>
        {#if isHost}
          <div class="g-host-row">
            <button class="btn" disabled={view.focus === 0} onclick={() => act({ type: 'focus', index: view.focus - 1 })}>⬅ Předchozí</button>
            {#if view.focus + 1 < view.categories.length}
              <button class="btn" onclick={() => act({ type: 'focus', index: view.focus + 1 })}>Další kategorie ➜</button>
            {/if}
            <button class="btn primary big" onclick={() => act({ type: 'next' })}>🧮 Spočítat kolo</button>
          </div>
        {/if}
      </section>
    {:else if view.phase === 'roundEnd'}
      <section class="stack g-narrow">
        <h1 class="g-center">Po {view.roundIndex + 1}. kole ({view.lastResult?.letter})</h1>
        <Standings rows={mjzStandingRows(view)} />
        {#if isHost}
          <div class="g-host-row">
            <button class="btn primary big" onclick={() => act({ type: 'next' })}>{lastRound ? '🏆 Konečné pořadí' : 'Další kolo ➜'}</button>
            {#if !lastRound}<button class="btn ghost" onclick={() => act({ type: 'end' })}>⏹ Ukončit hru</button>{/if}
          </div>
        {/if}
      </section>
    {:else if view.phase === 'finished'}
      <section class="stack g-narrow" data-testid="final">
        <h1 class="g-center">🏆 Konečné pořadí</h1>
        <Standings rows={mjzStandingRows(view)} showRound={false} />
        <div class="g-host-row"><a class="btn primary big" href="/tv">🏠 Nová hra</a></div>
      </section>
    {/if}

    {#if room.error}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
  {/if}
</main>

<style>
  .letter {
    color: var(--clay-dark);
  }
  .writing-head {
    display: flex;
    align-items: center;
    gap: 28px;
  }
  .stop {
    font-size: 1.3rem;
  }
  .progress {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .progress li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px;
    background: #fff;
    border: 3px solid var(--line);
    border-radius: var(--radius);
    font-size: 1.2rem;
  }
  .progress li.done {
    border-color: var(--sage);
    background: var(--sage-light);
  }
  .letter-small {
    font-size: 2rem;
    font-weight: 900;
    color: var(--clay-dark);
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
    display: grid;
    grid-template-columns: auto 8em 1fr auto auto;
    grid-template-areas: 'avatar who text points buttons' 'avatar who meta points buttons';
    align-items: center;
    gap: 2px 14px;
    padding: 10px 16px;
    background: #fff;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .answers li.invalid,
  .answers li.wrongLetter {
    background: var(--bad-bg);
  }
  .answers li.empty {
    opacity: 0.6;
  }
  .answers .g-avatar {
    grid-area: avatar;
  }
  .who {
    grid-area: who;
    font-size: 1.2rem;
  }
  .text {
    grid-area: text;
    font-size: 1.8rem;
    font-weight: 800;
  }
  .meta {
    grid-area: meta;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 0.95rem;
  }
  .points {
    grid-area: points;
    font-size: 1.5rem;
    font-weight: 900;
  }
  .host-buttons {
    grid-area: buttons;
    display: flex;
    gap: 6px;
  }
  .host-buttons :global(.btn[aria-pressed='true']) {
    background: var(--sage-light);
    border-color: var(--sage-dark);
  }
  @media (max-width: 900px) {
    .answers li {
      grid-template-columns: auto 1fr auto;
      grid-template-areas: 'avatar who points' 'avatar text points' 'avatar meta meta' 'buttons buttons buttons';
    }
  }
</style>
