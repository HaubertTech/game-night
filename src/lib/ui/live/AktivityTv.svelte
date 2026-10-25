<script lang="ts">
  import Celebrate from './Celebrate.svelte';
  import ArtIcon from '#lib/ui/live/ArtIcon.svelte';
  import { LEVEL_ART } from '#lib/ui/art/art.ts';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import './game.css';
  import type { AktivityCommand } from '../../games/aktivity/engine.ts';
  import { LEVEL_LABELS } from '../../types.ts';
  import { AKTIVITY_MODE_LABELS, DIFFICULTIES, type AktivityMode, type Difficulty } from '../../games/aktivity/types.ts';
  import type { LiveRoom } from '../../live-client/room.svelte.ts';
  import Standings from '../Standings.svelte';
  import ConnectionBadge from './ConnectionBadge.svelte';
  import Countdown from './Countdown.svelte';
  import JoinPanel from './JoinPanel.svelte';
  import { aktivityOutcomeText, aktivityPlayers, aktivityStandingRows, MODE_EMOJI } from './game-helpers.ts';

  let { room, code }: { room: LiveRoom; code: string } = $props();

  const view = $derived(room.aktivity);
  const isHost = $derived(view?.viewer === 'host');
  const players = $derived(view ? aktivityPlayers(view) : new Map());
  const teamById = $derived(new Map((view?.teams ?? []).map((t) => [t.id, t])));
  const cur = $derived(view?.current ?? null);
  const curTeam = $derived(cur ? teamById.get(cur.teamId) : undefined);
  const explainer = $derived(cur ? players.get(cur.explainerId) : undefined);
  const helper = $derived(cur?.helperId ? players.get(cur.helperId) : undefined);
  const last = $derived(view?.history.at(-1));
  const goalText = $derived(
    !view ? '' : view.goal.kind === 'points' ? `hraje se do ${view.goal.points} bodů` : `hraje se ${view.goal.rounds} ${view.goal.rounds === 1 ? 'kolo' : view.goal.rounds < 5 ? 'kola' : 'kol'}`,
  );

  function presenceLabel(id: string): string {
    const p = room.presence[id];
    if (p?.online) return '📱 připojen(a)';
    if (p?.claimed) return '📴 telefon odpojen';
    return '⏳ bez telefonu';
  }

  const modeLabel = (m: AktivityMode | null) => (m ? `${MODE_EMOJI[m]} ${AKTIVITY_MODE_LABELS[m]}` : '');
  const act = (command: AktivityCommand) => room.actAktivity(command);
</script>

<main class="g-tv" data-testid="tv-aktivity" data-phase={view?.phase ?? 'loading'}>
  <header class="g-bar">
    <span class="g-brand">🎭 Řekni-ukaž-nakresli</span>
    <span>Místnost <strong>{code}</strong></span>
    {#if cur}<span>Kolo {cur.round + 1} · {goalText}</span>{/if}
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
          <h1>Týmy</h1>
          {#each view.teams as t (t.id)}
            <div class="card stack team">
              <h2><span class="emoji"><Avatar value={t.avatar} fallback="👥" px={96} /></span> {t.name}</h2>
              <ul class="g-people">
                {#each t.players as p (p.id)}
                  <li data-testid="lobby-contestant" data-contestant={p.id} data-online={room.presence[p.id]?.online ? 'yes' : 'no'}>
                    <span class="emoji g-avatar"><Avatar value={p.avatar} fallback="🙂" px={96} /></span>
                    <strong class="g-grow">{p.name}</strong>
                    <span class="badge {p.level}"><ArtIcon name={LEVEL_ART[p.level]} /> {LEVEL_LABELS[p.level]}</span>
                    <span class="muted">{presenceLabel(p.id)}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
          <p class="muted">Telefon stačí tomu, kdo vysvětluje — uvidí na něm slovo. {view.timerSeconds} s na tah, {goalText}.</p>
          {#if isHost}<button class="btn primary big" onclick={() => act({ type: 'start' })}>▶️ Začít hru</button>{/if}
        </div>
      </section>
    {:else if view.phase === 'turnIntro' && cur && curTeam}
      <section class="stack g-center g-narrow" data-testid="turn-intro">
        <p class="turn-team">Na tahu je <strong><Avatar value={curTeam.avatar} fallback="👥" /> {curTeam.name}</strong></p>
        <div class="emoji g-huge"><Avatar value={explainer?.avatar} fallback="🙂" px={192} /></div>
        <h1 data-testid="explainer">Vysvětluje {explainer?.name}</h1>
        {#if helper}<p class="g-note">Slovo přečte {helper.name} — {explainer?.name} je předškolák, hraje se jen ukaž a nakresli.</p>{/if}
        <p class="muted">Obtížnost vybírá vysvětlující na telefonu (3, 4 nebo 5 bodů).</p>
        {#if isHost}
          <div class="row" role="group" aria-label="Obtížnost">
            {#each DIFFICULTIES as d (d)}
              <button class="chip diff" aria-pressed={cur.difficulty === d} onclick={() => act({ type: 'chooseDifficulty', difficulty: d as Difficulty })}>
                {d} {d === 3 ? 'lehké' : d === 4 ? 'střední' : 'těžké'}
              </button>
            {/each}
          </div>
          <div class="g-host-row">
            <button class="btn primary big" disabled={cur.difficulty === null} onclick={() => act({ type: 'startTurn' })}>▶️ Spustit čas</button>
            <button class="btn ghost" onclick={() => act({ type: 'end' })}>⏹ Ukončit hru</button>
          </div>
        {/if}
      </section>
    {:else if view.phase === 'playing' && cur && curTeam}
      <section class="stack g-center g-narrow" data-testid="playing">
        <p class="turn-team"><Avatar value={curTeam.avatar} fallback="👥" /> <strong>{curTeam.name}</strong> · vysvětluje {explainer?.name}</p>
        <p class="mode" data-testid="mode">{modeLabel(cur.mode)}</p>
        <p class="muted diff-line">Za {cur.difficulty} {cur.difficulty === 5 ? 'bodů' : 'body'}</p>
        {#if cur.allPlay}<p class="g-note all-play">🙌 Všichni hádají! Body bere tým, který uhodne první.</p>{/if}
        <div class="timer"><Countdown seconds={room.remaining} total={view.timerSeconds} /></div>
        <p class="big-left" aria-hidden="true">{room.remaining ?? ''}</p>
        {#if isHost}
          <div class="g-host-row">
            {#if cur.allPlay}
              {#each view.teams as t (t.id)}
                <button class="btn primary big" onclick={() => act({ type: 'guessed', teamId: t.id })}>✅ Uhodl tým {t.name}</button>
              {/each}
            {:else}
              <button class="btn primary big" onclick={() => act({ type: 'guessed' })}>✅ Uhodli!</button>
            {/if}
            <button class="btn big" onclick={() => act({ type: 'skip' })}>⏭ Přeskočit</button>
          </div>
        {/if}
      </section>
    {:else if view.phase === 'result' && last}
      <section class="stack g-center g-narrow" data-testid="turn-result">
        <p class="muted">Slovo bylo</p>
        {#if last.image}<div class="emoji g-huge">{last.image}</div>{/if}
        <h1 class="word" data-testid="revealed-word">{last.word}</h1>
        <p class="outcome" data-testid="outcome" data-outcome={last.outcome}>{aktivityOutcomeText(last, teamById)}</p>
        <div class="standings"><Standings rows={aktivityStandingRows(view)} showRound={false} /></div>
        {#if isHost}
          <div class="g-host-row">
            <button class="btn primary big" onclick={() => act({ type: 'next' })}>Další tah ➜</button>
            <button class="btn ghost" onclick={() => act({ type: 'end' })}>⏹ Ukončit hru</button>
          </div>
        {/if}
      </section>
    {:else if view.phase === 'finished'}
      <section class="stack g-narrow" data-testid="final">
        <Celebrate size={150} />
        <h1 class="g-center">{view.winners.length ? view.winners.map((id) => teamById.get(id)?.name).join(' a ') : 'Konec hry'}</h1>
        <Standings rows={aktivityStandingRows(view)} showRound={false} />
        {#if view.history.length}
          <details class="card">
            <summary>Odehraná slova ({view.history.length})</summary>
            <ul>
              {#each view.history as h (h.index)}
                <li>{h.image ?? ''} <strong>{h.word}</strong> — {teamById.get(h.teamId)?.name}: {aktivityOutcomeText(h, teamById)}</li>
              {/each}
            </ul>
          </details>
        {/if}
        <div class="g-host-row"><a class="btn primary big" href="/tv">🏠 Nová hra</a></div>
      </section>
    {/if}

    {#if room.error}<p class="g-toast" role="alert">{room.error.message}</p>{/if}
  {/if}
</main>

<style>
  .team h2 {
    margin: 0;
  }
  .turn-team {
    margin: 0;
    font-size: 1.8rem;
  }
  .mode {
    margin: 0;
    font-size: clamp(3rem, 8vw, 6rem);
    font-weight: 900;
  }
  .diff-line {
    margin: 0;
    font-size: 1.4rem;
  }
  .diff {
    font-size: 1.3rem;
    min-height: 64px;
  }
  .timer {
    width: 100%;
  }
  .big-left {
    margin: 0;
    font-size: clamp(5rem, 14vw, 10rem);
    font-weight: 900;
    line-height: 1;
  }
  .word {
    font-size: clamp(3rem, 9vw, 6rem);
    margin: 0;
  }
  .outcome {
    font-size: 1.6rem;
    font-weight: 800;
    margin: 0;
  }
  .standings {
    width: 100%;
    max-width: 640px;
    text-align: left;
  }
  .all-play {
    font-size: 1.4rem;
  }
</style>
