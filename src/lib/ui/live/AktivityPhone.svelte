<script lang="ts">
  import './game.css';
  import type { AktivityCommand } from '../../games/aktivity/engine.ts';
  import { AKTIVITY_MODE_LABELS, DIFFICULTIES, type Difficulty } from '../../games/aktivity/types.ts';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import Standings from '../Standings.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import Countdown from './Countdown.svelte';
  import SeatPicker from './SeatPicker.svelte';
  import { aktivityOutcomeText, aktivityPlayers, aktivityStandingRows, MODE_EMOJI } from './game-helpers.ts';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.aktivity);
  const players = $derived(view ? aktivityPlayers(view) : new Map());
  const teamById = $derived(new Map((view?.teams ?? []).map((t) => [t.id, t])));
  const me = $derived(room.me ? players.get(room.me) : undefined);
  const myTeam = $derived(me ? teamById.get(me.teamId) : undefined);
  const myScore = $derived(myTeam ? myTeam.score : 0);
  const cur = $derived(view?.current ?? null);
  const explainer = $derived(cur ? players.get(cur.explainerId) : undefined);
  const helping = $derived(!!cur && cur.helperId === room.me && cur.explainerId !== room.me);
  const ourTurn = $derived(!!cur && !!me && cur.teamId === me.teamId);
  const last = $derived(view?.history.at(-1));
  const seats = $derived(
    view ? view.teams.flatMap((t) => t.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar ?? '🙂', level: p.level, group: t.name }))) : [],
  );
  const act = (command: AktivityCommand) => room.actAktivity(command);
</script>

<main class="g-phone" data-testid="phone" data-game="aktivity" data-phase={view?.phase ?? 'loading'} data-me={room.me ?? ''}>
  <header class="g-bar">
    {#if me}
      <span><span class="emoji">{me.avatar ?? '🙂'}</span> <strong>{me.name}</strong>{#if myTeam} · {myTeam.name}{/if}</span>
      <span class="score" data-testid="my-score">{myScore} b.</span>
    {:else}
      <span>🎭 Místnost <strong>{code}</strong></span>
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
      <h1 class="g-center">🏆 {view.winners.map((id) => teamById.get(id)?.name).join(' a ') || 'Konec hry'}</h1>
      <Standings rows={aktivityStandingRows(view)} showRound={false} />
    </section>
  {:else if !me}
    <SeatPicker {seats} presence={room.presence} onPick={(id) => room.join(id)} />
  {:else if view.phase === 'setup'}
    <section class="stack g-center" data-testid="waiting">
      <div class="emoji g-huge">{me.avatar ?? '🙂'}</div>
      <h1>Jsi ve hře!</h1>
      <p class="muted">Hraješ za {myTeam?.name}. Čekáme, až hostitel spustí hru.</p>
      <button class="btn small ghost" onclick={() => room.leave()}>Nejsem {me.name}</button>
    </section>
  {:else if view.phase === 'turnIntro' && cur}
    {#if view.youExplain}
      <section class="stack g-center" data-testid="choose-difficulty">
        <h1>{helping ? `Pomáháš: ${explainer?.name}` : 'Vysvětluješ ty!'}</h1>
        <p class="muted">Vyber obtížnost. Hned potom běží čas — slovo uvidíš jen ty.</p>
        <div class="g-big-buttons">
          {#each DIFFICULTIES as d (d)}
            <button class="btn" class:primary={cur.difficulty === d} onclick={() => act({ type: 'startTurn', difficulty: d as Difficulty })}>
              {d} {d === 3 ? '· lehké' : d === 4 ? '· střední' : '· těžké'}
            </button>
          {/each}
        </div>
      </section>
    {:else}
      <section class="stack g-center" data-testid="wait-turn">
        <div class="emoji g-huge">{explainer?.avatar ?? '🙂'}</div>
        <h1>Vysvětluje {explainer?.name}</h1>
        <p class="muted">{ourTurn ? 'Váš tým je na tahu — připravte se hádat!' : `Na tahu je ${teamById.get(cur.teamId)?.name}.`}</p>
      </section>
    {/if}
  {:else if view.phase === 'playing' && cur}
    {#if view.youExplain && view.secret}
      <section class="stack g-center" data-testid="secret">
        <p class="mode">{cur.mode ? `${MODE_EMOJI[cur.mode]} ${AKTIVITY_MODE_LABELS[cur.mode]}` : ''}</p>
        {#if view.secret.image}<div class="emoji picture" data-testid="secret-image">{view.secret.image}</div>{/if}
        <h1 class="word" data-testid="secret-word">{view.secret.word}</h1>
        {#if view.secret.forbidden?.length}
          <p class="forbidden">🚫 Nesmíš říct: <strong>{view.secret.forbidden.join(', ')}</strong></p>
        {/if}
        <Countdown seconds={room.remaining} total={view.timerSeconds} />
        <div class="g-big-buttons">
          {#if cur.allPlay}
            {#each view.teams as t (t.id)}
              <button class="btn primary" onclick={() => act({ type: 'guessed', teamId: t.id })}>✅ Uhodl tým {t.name}</button>
            {/each}
          {:else}
            <button class="btn primary" onclick={() => act({ type: 'guessed' })}>✅ Uhodli!</button>
          {/if}
          <button class="btn" onclick={() => act({ type: 'skip' })}>⏭ Přeskočit</button>
        </div>
      </section>
    {:else}
      <section class="stack g-center" data-testid="guess">
        <div class="emoji g-huge">🤔</div>
        <h1>{cur.allPlay ? 'Hádají všichni!' : ourTurn ? 'Hádejte!' : 'Hádá druhý tým'}</h1>
        <Countdown seconds={room.remaining} total={view.timerSeconds} />
        <p class="muted">Vysvětluje {explainer?.name}.</p>
      </section>
    {/if}
  {:else if view.phase === 'result' && last}
    <section class="stack g-center" data-testid="turn-result">
      <p class="muted">Slovo bylo</p>
      {#if last.image}<div class="emoji g-huge">{last.image}</div>{/if}
      <h1 class="word">{last.word}</h1>
      <p><strong>{aktivityOutcomeText(last, teamById)}</strong></p>
      <Standings rows={aktivityStandingRows(view)} showRound={false} />
    </section>
  {/if}

  {#if room.error && room.status !== 'failed'}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
</main>

<style>
  .score {
    font-weight: 800;
  }
  .mode {
    margin: 0;
    font-size: 2rem;
    font-weight: 900;
  }
  .word {
    font-size: clamp(2.6rem, 13vw, 4.4rem);
    margin: 0;
    word-break: break-word;
  }
  .picture {
    font-size: 9rem;
  }
  .forbidden {
    margin: 0;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    background: var(--bad-bg);
    color: var(--bad);
    font-size: 1.15rem;
  }
</style>
