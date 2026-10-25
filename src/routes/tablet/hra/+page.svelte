<script lang="ts">
  import ArtIcon from '#lib/ui/live/ArtIcon.svelte';
  import { THEME_ART } from '#lib/ui/art/art.ts';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { LEVEL_READER, THEME_LABELS, hasOptions, isChildLevel } from '#lib/types.ts';
  import {
    currentContestant,
    currentQuestion,
    currentRound,
    currentTurn,
    hasJokerInRound,
    lastAnswer,
    reduce,
    standings,
    summarize,
    timerFor,
    type Action,
    type GameState,
  } from '#lib/engine/index.ts';
  import { addSeen, clearCurrentGame, downloadHistory, loadCurrentGame, recordGame, saveCurrentGame } from '#lib/storage.ts';
  import { questionSpeech, speak, stop } from '#lib/tts.ts';
  import RoundIntro from '#lib/ui/RoundIntro.svelte';
  import Handover from '#lib/ui/Handover.svelte';
  import QuestionCard from '#lib/ui/QuestionCard.svelte';
  import Feedback from '#lib/ui/Feedback.svelte';
  import Standings from '#lib/ui/Standings.svelte';
  import FinalScreen from '#lib/ui/FinalScreen.svelte';
  import ContestantTag from '#lib/ui/ContestantTag.svelte';
  import TimerBar from '#lib/ui/TimerBar.svelte';
  import { syncTabletGame, type SyncStatus } from '#lib/ui/app/tablet-sync.ts';
  import type { HistoryEntry } from '#lib/storage.ts';

  let game = $state.raw<GameState | null>(null);
  let sync = $state<SyncStatus>({ state: 'idle' });
  let lastEntry: HistoryEntry | null = null;

  onMount(() => {
    const saved = loadCurrentGame();
    if (!saved) {
      goto('/tablet', { replaceState: true });
      return;
    }
    game = saved;
    if (saved.phase === 'finished') record(saved);
    return () => stop();
  });

  function record(state: GameState) {
    const summary = summarize(state);
    const entry: HistoryEntry = {
      id: state.id,
      playedAt: state.createdAt || new Date().toISOString(),
      themes: state.config.themes,
      contestants: state.config.contestants,
      ranking: summary.ranking.map((r) => ({ contestantId: r.contestant.id, score: r.score, place: r.place })),
      themeStats: summary.themeStats,
      best: summary.best,
      answers: state.answers,
    };
    recordGame(entry);
    lastEntry = entry;
    sendToServer();
    const byProfile: Record<string, string[]> = {};
    for (const c of state.config.contestants) {
      for (const member of c.memberIds) {
        byProfile[member] = [...(byProfile[member] ?? []), ...(summary.seenByContestant[c.id] ?? [])];
      }
    }
    addSeen(byProfile);
  }

  /** Optional: only when this device is logged in to a household. */
  async function sendToServer(createMissing = false) {
    if (!lastEntry) return;
    sync = { state: 'saving' };
    sync = await syncTabletGame(lastEntry, { createMissing });
  }

  function dispatch(action: Action) {
    if (!game) return;
    const next = reduce(game, action);
    if (next === game) return;
    game = next;
    saveCurrentGame(next);
    if (next.phase === 'finished') record(next);
    window.scrollTo?.({ top: 0 });
  }

  const round = $derived(game ? currentRound(game) : undefined);
  const turn = $derived(game ? currentTurn(game) : undefined);
  const contestant = $derived(game ? currentContestant(game) : undefined);
  const question = $derived(game ? currentQuestion(game) : undefined);
  const kids = $derived(contestant ? isChildLevel(contestant.level) : false);
  /** Piskoviste does not read: the app reads the question and the result aloud. Prvnacek reads on a tap. */
  const autoRead = $derived(contestant ? LEVEL_READER[contestant.level] === 'tts' : false);
  const timer = $derived(game ? timerFor(game) : null);
  const jokerNow = $derived(game && contestant ? hasJokerInRound(game, contestant.id) : false);

  function readQuestion() {
    if (!question || !turn) return;
    speak(...questionSpeech(question.text, hasOptions(question) ? (turn.options ?? question.options) : []));
  }

  function onReady() {
    dispatch({ type: 'ready' });
    // Speak inside the tap handler: iPad Safari only allows speech started by a user gesture.
    if (autoRead) readQuestion();
  }

  function onAnswer(value: string | number) {
    stop();
    dispatch({ type: 'answer', value });
    if (autoRead && game) {
      const a = lastAnswer(game);
      const q = question;
      if (a && q && hasOptions(q)) speak(a.correct ? 'Správně!' : `Správně je ${q.answer}.`, q.fact);
    }
  }

  function jokerState(id: string): 'here' | 'free' | 'used' {
    const j = game?.jokers[id];
    if (j === null || j === undefined) return 'free';
    return j === game!.roundIndex ? 'here' : 'used';
  }

  function leave() {
    stop();
    goto('/tablet');
  }

  function newGame() {
    stop();
    clearCurrentGame();
    goto('/tablet');
  }

  const nextLabel = $derived(
    game && round && game.turnIndex + 1 < round.turns.length ? 'Další hráč' : 'Konec kola',
  );
</script>

<svelte:head><title>Kvízovna · Herní večer</title></svelte:head>

{#if game}
  <main class="page game" data-testid="game" data-phase={game.phase}>
    <nav class="topbar">
      <button class="btn small ghost" onclick={leave} aria-label="Zpět na start">🏠</button>
      {#if round && game.phase !== 'finished'}
        <span class="where">
          <ArtIcon name={THEME_ART[round.theme]} em={1.6} />
          {THEME_LABELS[round.theme]} · kolo {game.roundIndex + 1}/{game.rounds.length}
          {#if game.phase !== 'roundIntro' && game.phase !== 'roundEnd'}· otázka {game.turnIndex + 1}/{round.turns.length}{/if}
        </span>
      {/if}
    </nav>

    {#if game.phase === 'roundIntro' && round}
      <RoundIntro
        theme={round.theme}
        roundNumber={game.roundIndex + 1}
        roundCount={game.rounds.length}
        contestants={game.config.contestants}
        {jokerState}
        onToggleJoker={(id) => dispatch({ type: 'toggleJoker', contestantId: id })}
        onStart={() => dispatch({ type: 'startRound' })}
      />
    {:else if game.phase === 'handover' && contestant && turn}
      <Handover {contestant} joker={jokerNow} mix={turn.fallback && kids} {onReady} />
    {:else if (game.phase === 'question' || game.phase === 'judge') && contestant && turn && question}
      <section class="stack">
        <div class="row who">
          <ContestantTag {contestant} joker={jokerNow} />
        </div>
        {#key `${game.roundIndex}-${game.turnIndex}`}
          {#if timer && game.phase === 'question'}
            <TimerBar seconds={timer} onTimeout={() => dispatch({ type: 'timeout' })} />
          {/if}
          <QuestionCard
            {question}
            {turn}
            phase={game.phase}
            {onAnswer}
            onReveal={() => dispatch({ type: 'reveal' })}
            onJudge={(correct) => dispatch({ type: 'judge', correct })}
            onSpeak={readQuestion}
          />
        {/key}
      </section>
    {:else if game.phase === 'feedback' && question}
      {@const answer = lastAnswer(game)}
      {#if answer}
        <Feedback {question} {answer} {nextLabel} onNext={() => dispatch({ type: 'next' })} />
      {/if}
    {:else if game.phase === 'roundEnd' && round}
      <article class="stack round-end" data-testid="round-end">
        <h1>Průběžné pořadí</h1>
        <p class="muted">Po kole {game.roundIndex + 1} z {game.rounds.length} · {THEME_LABELS[round.theme]}</p>
        <Standings rows={standings(game)} />
        <button class="btn primary big" onclick={() => dispatch({ type: 'next' })}>
          {game.roundIndex + 1 < game.rounds.length ? '▶️ Další kolo' : '🏆 Výsledky'}
        </button>
      </article>
    {:else if game.phase === 'finished'}
      {#if sync.state === 'saved'}
        <p class="sync ok" role="status">✅ Uloženo do ligy{#if sync.nightId} · <a href={`/vecery/${sync.nightId}`}>zpět do večera</a>{/if}</p>
      {:else if sync.state === 'missing'}
        <div class="sync warn" role="status">
          <span>Na serveru chybí profily: {sync.missing.map((p) => p.name).join(', ')}.</span>
          <button class="btn small" onclick={() => sendToServer(true)}>Založit profily a uložit</button>
        </div>
      {:else if sync.state === 'error'}
        <div class="sync warn" role="status">
          <span>Do ligy se hru nepodařilo uložit: {sync.message}</span>
          <button class="btn small" onclick={() => sendToServer()}>Zkusit znovu</button>
        </div>
      {/if}
      <FinalScreen {game} summary={summarize(game)} onNewGame={newGame} onExport={downloadHistory} />
    {/if}
  </main>
{/if}

<style>
  .game {
    min-height: 100vh;
    min-height: 100dvh;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .where {
    font-weight: 700;
    color: var(--ink-soft);
  }
  .who {
    justify-content: center;
  }
  .round-end {
    align-items: stretch;
    max-width: 760px;
    margin: 0 auto;
    text-align: center;
  }
  .round-end h1 {
    margin: 0;
    font-size: 2.4rem;
  }
  .round-end p {
    margin: 0;
  }
  .round-end .btn {
    align-self: center;
  }
  .sync {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    max-width: 760px;
    margin: 0 auto 12px;
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    background: var(--sage-light);
  }
  .sync.warn {
    background: var(--clay-light);
  }
</style>
