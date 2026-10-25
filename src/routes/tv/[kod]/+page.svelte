<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { LEVEL_LABELS, THEME_LABELS } from '#lib/types.ts';
  import { LiveRoom } from '#lib/live-client/room.svelte.ts';
  import { readToken } from '#lib/live-client/tokens.ts';
  import { questionSpeech, speak, stop } from '#lib/tts.ts';
  import { LEVEL_EMOJI, THEME_EMOJI } from '#lib/ui/labels.ts';
  import RoundIntro from '#lib/ui/RoundIntro.svelte';
  import Standings from '#lib/ui/Standings.svelte';
  import ConnectionBadge from '#lib/ui/live/ConnectionBadge.svelte';
  import Countdown from '#lib/ui/live/Countdown.svelte';
  import AktivityTv from '#lib/ui/live/AktivityTv.svelte';
  import MjzTv from '#lib/ui/live/MjzTv.svelte';
  import LiveFinal from '#lib/ui/live/LiveFinal.svelte';
  import LiveQuestion from '#lib/ui/live/LiveQuestion.svelte';
  import QrCode from '#lib/ui/live/QrCode.svelte';
  import RevealCard from '#lib/ui/live/RevealCard.svelte';
  import { contestantMap, correctAnswerText, standingRows } from '#lib/ui/live/view-helpers.ts';

  const code = (page.params.kod ?? '').toUpperCase();
  const hasHostToken = typeof window !== 'undefined' && !!readToken('host', code);
  const room = new LiveRoom(code, hasHostToken ? 'host' : 'player');

  const view = $derived(room.view);
  const isHost = $derived(view?.viewer === 'host');
  const byId = $derived(view ? contestantMap(view) : new Map());
  const active = $derived(view ? view.contestants.filter((c) => !c.kicked) : []);
  const joinUrl = $derived(typeof location === 'undefined' ? `/m/${code}` : `${location.origin}/m/${code}`);
  const tvContestant = $derived(view?.questionFor ? byId.get(view.questionFor) : undefined);
  const lastStep = $derived(view ? view.step + 1 >= view.stepCount : false);
  const lastRound = $derived(view ? view.roundIndex + 1 >= view.roundCount : false);

  let wakeLock: { release(): Promise<void> } | null = null;
  async function keepAwake() {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      if (nav.wakeLock && document.visibilityState === 'visible') wakeLock = await nav.wakeLock.request('screen');
    } catch {
      // Not supported or refused; the TV just may dim.
    }
  }

  onMount(() => {
    room.connect();
    void keepAwake();
    const onVis = () => void keepAwake();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void wakeLock?.release().catch(() => undefined);
      stop();
      room.destroy();
    };
  });

  // Errors fade out after a few seconds.
  $effect(() => {
    const e = room.error;
    if (!e || room.status === 'failed') return;
    const t = setTimeout(() => room.clearError(), 4000);
    return () => clearTimeout(t);
  });

  function readTvQuestion() {
    const q = view?.question;
    if (q) speak(...questionSpeech(q.text, q.options ?? []));
  }

  // Read the TV contestant's question aloud when it appears (preschool cannot read).
  let spokenKey = '';
  $effect(() => {
    const q = view?.question;
    if (!view || !q || view.stage !== 'tv') return;
    const key = `${view.roundIndex}/${view.step}/${view.questionFor}`;
    if (key === spokenKey) return;
    spokenKey = key;
    if (q.level === 'piskoviste') readTvQuestion();
  });

  // …and the result of a TV preschooler at reveal.
  let revealKey = '';
  $effect(() => {
    if (!view || view.phase !== 'reveal' || !view.reveal) return;
    const key = `${view.roundIndex}/${view.step}`;
    if (key === revealKey) return;
    revealKey = key;
    const kid = view.reveal.find((r) => byId.get(r.contestantId)?.onTv && r.question.level === 'piskoviste');
    if (kid) speak(kid.correct ? 'Správně!' : `Správně je ${correctAnswerText(kid.question)}.`, kid.question.fact);
  });

  function jokerState(id: string): 'here' | 'free' | 'used' {
    const j = byId.get(id)?.joker;
    if (j === null || j === undefined) return 'free';
    return j === view?.roundIndex ? 'here' : 'used';
  }

  function presenceLabel(id: string, onTv: boolean): string {
    if (onTv) return '📺 hraje na televizi';
    const p = room.presence[id];
    if (p?.online) return '📱 připojen(a)';
    if (p?.claimed) return '📴 telefon odpojen';
    return '⏳ čeká na telefon';
  }
</script>

<svelte:head><title>{room.game === 'aktivity' ? 'Řekni, ukaž, nakresli' : room.game === 'mjz' ? 'Město, jméno, zvíře' : 'Kvízovna'} · místnost {code}</title></svelte:head>

{#if room.game === 'aktivity'}
  <AktivityTv {room} {code} />
{:else if room.game === 'mjz'}
  <MjzTv {room} {code} />
{:else}

<main class="tv" data-testid="tv" data-phase={view?.phase ?? 'loading'} data-stage={view?.stage ?? ''}>
  <header class="bar">
    <span class="brand">📺 Kvízovna</span>
    <span class="code-small" data-testid="room-code-small">Místnost <strong>{code}</strong></span>
    {#if view && view.phase !== 'lobby' && view.theme}
      <span class="round">Kolo {view.roundIndex + 1}/{view.roundCount} · {THEME_EMOJI[view.theme]} {THEME_LABELS[view.theme]}</span>
    {/if}
    <ConnectionBadge status={room.status} />
  </header>

  {#if room.status === 'failed'}
    <section class="center card notice">
      <h1>😕 {room.error?.code === 'forbidden' ? 'Tahle obrazovka není hostitel' : 'Místnost nejde otevřít'}</h1>
      <p>{room.error?.message}</p>
      <a class="btn primary big" href="/tv">Založit novou hru</a>
    </section>
  {:else if !view}
    <p class="center muted loading">Připojuji se k místnosti…</p>
  {:else}
    {#if !isHost}
      <p class="spectator">👀 Jen sledování — hostitelský klíč je v prohlížeči, kde se hra zakládala.</p>
    {/if}

    {#if view.phase === 'lobby'}
      <section class="lobby">
        <div class="join">
          <QrCode text={joinUrl} label={`QR kód pro připojení: ${joinUrl}`} />
          <p class="how">Naskenuj telefonem, nebo otevři <strong>{joinUrl.replace(/^https?:\/\//, '')}</strong></p>
          <p class="code" data-testid="room-code" aria-label={`Kód místnosti ${code.split('').join(' ')}`}>{code}</p>
        </div>
        <div class="who stack">
          <h1>Kdo hraje</h1>
          <ul class="people">
            {#each active as c (c.id)}
              <li data-testid="lobby-contestant" data-contestant={c.id} data-online={room.presence[c.id]?.online ? 'yes' : 'no'}>
                <span class="emoji avatar">{c.avatar}</span>
                <span class="person">
                  <strong>{c.name}</strong>
                  <span class="badge {c.level}">{LEVEL_EMOJI[c.level]} {LEVEL_LABELS[c.level]}</span>
                  <span class="muted">{presenceLabel(c.id, c.onTv)}</span>
                </span>
                {#if isHost}
                  <button
                    class="chip"
                    aria-pressed={c.onTv}
                    aria-label={`${c.name} hraje na TV`}
                    onclick={() => room.act({ type: 'setOnTv', contestantId: c.id, onTv: !c.onTv })}
                  >📺 Na TV</button>
                {/if}
              </li>
            {/each}
          </ul>
          {#if isHost}
            <button class="btn primary big" onclick={() => room.act({ type: 'start' })}>▶️ Začít hru</button>
          {/if}
        </div>
      </section>
    {:else if view.phase === 'roundIntro' && view.theme}
      {#if isHost}
        <RoundIntro
          theme={view.theme}
          roundNumber={view.roundIndex + 1}
          roundCount={view.roundCount}
          contestants={active.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar, level: c.level, memberIds: [] }))}
          {jokerState}
          onToggleJoker={(id) => room.act({ type: 'toggleJoker', contestantId: id })}
          onStart={() => room.act({ type: 'startRound' })}
        />
      {:else}
        <section class="center"><div class="emoji big-emoji">{THEME_EMOJI[view.theme]}</div><h1>{THEME_LABELS[view.theme]}</h1></section>
      {/if}
    {:else if view.phase === 'asking' && view.stage === 'tv' && view.question && tvContestant}
      <section class="tv-turn stack">
        <p class="turn-who" data-testid="tv-turn">
          📺 Odpovídá <span class="emoji">{tvContestant.avatar}</span> <strong>{tvContestant.name}</strong>
          {#if tvContestant.joker === view.roundIndex}<span class="badge joker">🃏 ×2</span>{/if}
        </p>
        <Countdown seconds={room.remaining} total={view.timerSeconds} />
        {#key `${view.roundIndex}/${view.step}/${view.questionFor}`}
          <LiveQuestion
            question={view.question}
            size="tv"
            disabled={!isHost}
            maxLength={view.openAnswerMax}
            onSpeak={readTvQuestion}
            onAnswer={(value) => {
              stop();
              room.act({ type: 'answer', value });
            }}
          />
        {/key}
        {#if isHost}
          <div class="host-row"><button class="btn small ghost" onclick={() => room.act({ type: 'closeAnswers' })}>⏭ Přeskočit</button></div>
        {/if}
      </section>
    {:else if view.phase === 'asking'}
      <section class="asking stack">
        <div class="center">
          <p class="muted step">Otázka {view.step + 1} z {view.stepCount}</p>
          <h1>Odpovídejte na telefonech 📱</h1>
        </div>
        <Countdown seconds={room.remaining} total={view.timerSeconds} />
        <ul class="answered">
          {#each active.filter((c) => c.inStep) as c (c.id)}
            <li class:done={c.answered} data-testid="answer-status" data-contestant={c.id} data-answered={c.answered ? 'yes' : 'no'}>
              <span class="emoji avatar">{c.avatar}</span>
              <strong>{c.name}</strong>
              <span>{c.onTv ? '📺 po telefonech' : c.answered ? '✅ odpověděl(a)' : room.presence[c.id]?.online ? '🤔 přemýšlí…' : '📴 nepřipojen(a)'}</span>
            </li>
          {/each}
        </ul>
        {#if isHost}
          <div class="host-row">
            <button class="btn" onclick={() => room.act({ type: 'closeAnswers' })}>⏹ Ukončit odpovídání</button>
          </div>
        {/if}
      </section>
    {:else if view.phase === 'reveal' && view.reveal}
      <section class="stack">
        <h1 class="center">Jak to dopadlo</h1>
        <div class="reveals">
          {#each view.reveal as r (r.contestantId)}
            <RevealCard
              reveal={r}
              contestant={byId.get(r.contestantId)}
              onJudge={isHost ? (correct) => room.act({ type: 'judge', contestantId: r.contestantId, correct }) : undefined}
            />
          {/each}
        </div>
        {#if isHost}
          <div class="host-row">
            <button class="btn primary big" disabled={view.unjudged.length > 0} onclick={() => room.act({ type: 'next' })}>
              {lastStep ? 'Konec kola ➜' : 'Další otázka ➜'}
            </button>
          </div>
          {#if view.unjudged.length > 0}<p class="center muted">Nejdřív posuď otevřené odpovědi ✓/✗.</p>{/if}
        {/if}
      </section>
    {:else if view.phase === 'roundEnd'}
      <section class="stack narrow">
        <h1 class="center">Po {view.roundIndex + 1}. kole</h1>
        <Standings rows={standingRows(view)} />
        {#if isHost}
          <div class="host-row">
            <button class="btn primary big" onclick={() => room.act({ type: 'next' })}>{lastRound ? '🏆 Konečné pořadí' : 'Další kolo ➜'}</button>
          </div>
        {/if}
      </section>
    {:else if view.phase === 'finished'}
      <section class="narrow">
        <LiveFinal {view} questions={room.questions} />
        <div class="host-row"><a class="btn primary big" href="/tv">🏠 Nová hra</a></div>
      </section>
    {/if}

    {#if room.error}
      <p class="toast" role="alert">{room.error.message}</p>
    {/if}
  {/if}
</main>
{/if}

<style>
  .tv {
    min-height: 100vh;
    padding: 16px 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
    font-size: 1.1rem;
  }
  .brand {
    font-weight: 800;
  }
  .round {
    font-weight: 750;
  }
  .bar :global(.conn) {
    margin-left: auto;
  }
  .center {
    text-align: center;
  }
  .notice {
    max-width: 640px;
    margin: 40px auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }
  .loading {
    font-size: 1.6rem;
    margin-top: 20vh;
  }
  .spectator {
    margin: 0;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    background: var(--slate-light);
  }
  .lobby {
    display: grid;
    grid-template-columns: minmax(280px, 0.9fr) 1.1fr;
    gap: 40px;
    align-items: start;
  }
  .join {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: 460px;
    justify-self: center;
    width: 100%;
  }
  .how {
    margin: 0;
    font-size: 1.2rem;
    text-align: center;
  }
  .code {
    margin: 0;
    font-size: clamp(4rem, 10vw, 8rem);
    font-weight: 900;
    letter-spacing: 0.18em;
    line-height: 1;
  }
  .people {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .people li {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 16px;
    background: #fff;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .people li[data-online='yes'] {
    border-color: var(--sage);
  }
  .person {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    font-size: 1.3rem;
  }
  .avatar {
    font-size: 2.4rem;
  }
  .big-emoji {
    font-size: 7rem;
  }
  .step {
    margin: 0;
    font-size: 1.2rem;
  }
  .answered {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }
  .answered li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 16px;
    background: #fff;
    border: 3px solid var(--line);
    border-radius: var(--radius);
    font-size: 1.25rem;
  }
  .answered li.done {
    border-color: var(--sage);
    background: var(--sage-light);
  }
  .answered .avatar {
    font-size: 3.5rem;
  }
  .tv-turn {
    align-items: center;
    max-width: 1300px;
    margin: 0 auto;
    width: 100%;
  }
  .turn-who {
    margin: 0;
    font-size: 1.8rem;
  }
  .joker {
    background: var(--clay);
    color: #fffaf3;
  }
  .reveals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 16px;
  }
  .host-row {
    display: flex;
    justify-content: center;
    gap: 12px;
  }
  .narrow {
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
  }
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 12px 20px;
    background: var(--ink);
    color: var(--paper);
    border-radius: var(--radius-sm);
    font-weight: 700;
  }
  @media (max-width: 900px) {
    .lobby {
      grid-template-columns: 1fr;
    }
  }
</style>
