<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { LEVEL_LABELS, THEME_LABELS } from '#lib/types.ts';
  import { LiveRoom } from '#lib/live-client/room.svelte.ts';
  import { questionSpeech, speak, stop } from '#lib/tts.ts';
  import { LEVEL_EMOJI, THEME_EMOJI } from '#lib/ui/labels.ts';
  import Standings from '#lib/ui/Standings.svelte';
  import ConnectionBadge from '#lib/ui/live/ConnectionBadge.svelte';
  import Countdown from '#lib/ui/live/Countdown.svelte';
  import LiveFinal from '#lib/ui/live/LiveFinal.svelte';
  import LiveQuestion from '#lib/ui/live/LiveQuestion.svelte';
  import RevealCard from '#lib/ui/live/RevealCard.svelte';
  import { contestantMap, correctAnswerText, givenText, standingRows } from '#lib/ui/live/view-helpers.ts';

  const code = (page.params.kod ?? '').toUpperCase();
  const room = new LiveRoom(code, 'player');

  const view = $derived(room.view);
  const byId = $derived(view ? contestantMap(view) : new Map());
  const me = $derived(room.me ? byId.get(room.me) : undefined);
  const kids = $derived(me?.level === 'piskoviste');
  const mine = $derived(view?.reveal?.find((r) => r.contestantId === room.me));
  const tvNow = $derived(view?.stage === 'tv' ? view.contestants.filter((c) => c.onTv && c.inStep && !c.answered) : []);
  const pickable = $derived(view ? view.contestants.filter((c) => !c.onTv && !c.kicked) : []);
  const jokerUsed = $derived(me ? me.joker !== null && me.joker !== view?.roundIndex : false);
  const jokerHere = $derived(me ? me.joker === view?.roundIndex : false);

  onMount(() => {
    room.connect();
    return () => {
      stop();
      room.destroy();
    };
  });

  $effect(() => {
    const e = room.error;
    if (!e || room.status === 'failed') return;
    const t = setTimeout(() => room.clearError(), 4000);
    return () => clearTimeout(t);
  });

  function readQuestion() {
    const q = view?.question;
    if (q) speak(...questionSpeech(q.text, q.options ?? []));
  }

  function readResult() {
    if (!mine) return;
    speak(mine.correct ? 'Správně!' : `Správně je ${correctAnswerText(mine.question)}.`, mine.question.fact);
  }

  function answer(value: string | number) {
    stop();
    room.act({ type: 'answer', value });
  }
</script>

<svelte:head><title>Kvízovna · {code}</title></svelte:head>

<main class="phone" data-testid="phone" data-phase={view?.phase ?? 'loading'} data-me={room.me ?? ''}>
  <header class="bar">
    {#if me}
      <span class="me"><span class="emoji">{me.avatar}</span> <strong>{me.name}</strong></span>
      <span class="score" data-testid="my-score">{me.score} b.</span>
    {:else}
      <span class="me">📱 Místnost <strong>{code}</strong></span>
    {/if}
    <ConnectionBadge status={room.status} />
  </header>

  {#if room.status === 'failed'}
    <section class="card stack center">
      <h1>😕 Místnost nejde otevřít</h1>
      <p>{room.error?.message}</p>
      <a class="btn primary big" href="/m">Zadat jiný kód</a>
    </section>
  {:else if !view}
    <p class="center muted">Připojuji se…</p>
  {:else if view.phase === 'finished'}
    <LiveFinal {view} questions={room.questions} compact />
  {:else if !room.me || !me}
    <section class="stack" data-testid="picker">
      <h1>Kdo jsi?</h1>
      {#if pickable.length === 0}
        <p class="muted">Všichni hrají na televizi. Požádej hostitele, ať tě přepne na telefon.</p>
      {/if}
      <div class="pick">
        {#each pickable as c (c.id)}
          {@const taken = room.presence[c.id]?.claimed}
          <button class="who" disabled={taken} onclick={() => room.join(c.id)} aria-label={`Jsem ${c.name}`}>
            <span class="emoji avatar">{c.avatar}</span>
            <span class="name">{c.name}</span>
            <span class="badge {c.level}">{LEVEL_EMOJI[c.level]} {LEVEL_LABELS[c.level]}</span>
            {#if taken}<span class="muted small">už hraje jiný telefon</span>{/if}
          </button>
        {/each}
      </div>
    </section>
  {:else if me.onTv}
    <section class="center stack">
      <div class="emoji huge">📺</div>
      <h1>Hraješ na televizi</h1>
      <p class="muted">Hostitel tě přepnul na televizi. Odpovídej tam.</p>
    </section>
  {:else if view.phase === 'lobby'}
    <section class="center stack" data-testid="waiting">
      <div class="emoji huge">{me.avatar}</div>
      <h1>Jsi ve hře!</h1>
      <p class="muted">Čekáme, až hostitel spustí hru na televizi.</p>
      <button class="btn small ghost" onclick={() => room.leave()}>Nejsem {me.name}</button>
    </section>
  {:else if view.phase === 'roundIntro' && view.theme}
    <section class="center stack">
      <p class="muted">Kolo {view.roundIndex + 1} z {view.roundCount}</p>
      <div class="emoji huge">{THEME_EMOJI[view.theme]}</div>
      <h1>{THEME_LABELS[view.theme]}</h1>
      <button
        class="btn big joker"
        aria-pressed={jokerHere}
        disabled={jokerUsed}
        onclick={() => room.act({ type: 'toggleJoker', contestantId: me.id })}
        data-testid="joker"
      >
        🃏 {jokerHere ? 'Žolík v tomto kole (×2)' : jokerUsed ? 'Žolík už je použitý' : 'Zahrát žolíka (×2)'}
      </button>
      <p class="muted">Žolík máš jednou za hru. Hostitel teď spustí kolo.</p>
    </section>
  {:else if view.phase === 'asking'}
    <section class="stack">
      <Countdown seconds={me.inStep && !me.answered ? room.remaining : null} total={view.timerSeconds} />
      {#if view.question && view.questionFor === me.id}
        {#key `${view.roundIndex}/${view.step}`}
          <LiveQuestion
            question={view.question}
            maxLength={view.openAnswerMax}
            onSpeak={kids ? readQuestion : undefined}
            onAnswer={answer}
          />
        {/key}
      {:else if view.myAnswer !== undefined || me.answered}
        <div class="center stack" data-testid="sent">
          <div class="emoji huge">📨</div>
          <h1>Odpověď odeslána</h1>
          {#if view.myAnswer !== undefined && view.myAnswer !== null}<p class="muted">„{view.myAnswer}“</p>{/if}
          <p class="muted">
            {tvNow.length ? `Teď odpovídá ${tvNow.map((c) => c.name).join(', ')} na televizi.` : 'Čekáme na ostatní.'}
          </p>
        </div>
      {:else if tvNow.length}
        <div class="center stack"><div class="emoji huge">📺</div><h1>Teď hraje {tvNow.map((c) => c.name).join(', ')} na televizi</h1></div>
      {:else}
        <div class="center stack"><h1>Teď nehraješ</h1><p class="muted">Počkej na další otázku.</p></div>
      {/if}
    </section>
  {:else if view.phase === 'reveal'}
    <section class="stack">
      {#if mine}
        <RevealCard reveal={mine} contestant={me} mine />
        {#if kids}<button class="btn" onclick={readResult}>🔊 Přečíst</button>{/if}
      {:else}
        <p class="center muted">V této otázce jsi nehrál(a).</p>
      {/if}
      <details class="others">
        <summary>Jak odpověděli ostatní</summary>
        <ul>
          {#each view.reveal?.filter((r) => r.contestantId !== room.me) ?? [] as r (r.contestantId)}
            {@const c = byId.get(r.contestantId)}
            <li>{c?.avatar} {c?.name}: {givenText(r.question, r.given)} {r.awaitingJudge ? '❔' : r.correct ? '✅' : '❌'}</li>
          {/each}
        </ul>
      </details>
    </section>
  {:else if view.phase === 'roundEnd'}
    <section class="stack">
      <h1 class="center">Po {view.roundIndex + 1}. kole</h1>
      <Standings rows={standingRows(view)} />
    </section>
  {/if}

  {#if room.error && room.status !== 'failed'}
    <p class="toast" role="alert">{room.error.message}</p>
  {/if}
</main>

<style>
  .phone {
    max-width: 560px;
    margin: 0 auto;
    min-height: 100vh;
    padding: max(12px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .me {
    font-size: 1.15rem;
  }
  .score {
    font-weight: 800;
  }
  .bar :global(.conn) {
    margin-left: auto;
  }
  .center {
    text-align: center;
    align-items: center;
  }
  .huge {
    font-size: 5rem;
  }
  .pick {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .who {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    min-height: 84px;
    padding: 12px 18px;
    border: 2px solid var(--ink);
    border-radius: var(--radius-sm);
    background: #fff;
    box-shadow: 0 3px 0 var(--ink);
    text-align: left;
  }
  .who:disabled {
    opacity: 0.45;
    box-shadow: none;
  }
  .who .avatar {
    font-size: 2.6rem;
  }
  .who .name {
    font-size: 1.4rem;
    font-weight: 800;
  }
  .small {
    font-size: 0.9rem;
    width: 100%;
  }
  .joker {
    width: 100%;
  }
  .joker[aria-pressed='true'] {
    background: var(--clay);
    border-color: var(--clay-dark);
    color: #fffaf3;
  }
  .others ul {
    padding-left: 1.2em;
  }
  .toast {
    position: fixed;
    bottom: 16px;
    left: 16px;
    right: 16px;
    margin: 0;
    padding: 12px 16px;
    background: var(--ink);
    color: var(--paper);
    border-radius: var(--radius-sm);
    font-weight: 700;
    text-align: center;
  }
</style>
