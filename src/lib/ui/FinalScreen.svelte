<script lang="ts">
  import { THEME_LABELS, type Theme } from '../types.ts';
  import type { GameState, GameSummary } from '../engine/quiz.ts';
  import { formatNumber, THEME_EMOJI } from './labels.ts';
  import Standings from './Standings.svelte';

  let { game, summary, onNewGame, onExport }: { game: GameState; summary: GameSummary; onNewGame: () => void; onExport: () => void } =
    $props();

  const themesPlayed = $derived(
    Array.from(
      new Set(Object.values(summary.themeStats).flatMap((stats) => Object.keys(stats) as Theme[])),
    ),
  );

  const best = $derived(summary.best);
  const bestContestant = $derived(best ? game.config.contestants.find((c) => c.id === best.contestantId) : undefined);
  const bestQuestion = $derived(best ? game.questions[best.questionId] : undefined);
  const winners = $derived(summary.ranking.filter((r) => r.place === 1));
</script>

<article class="final stack" data-testid="final">
  <header class="center">
    <div class="emoji trophy" aria-hidden="true">🏆</div>
    <h1>Konečné pořadí</h1>
    <p class="muted">
      Vítězí {winners.map((w) => `${w.contestant.avatar} ${w.contestant.name}`).join(' a ')}!
    </p>
  </header>

  <Standings rows={summary.ranking} showRound={false} />

  {#if best && bestContestant && bestQuestion}
    <section class="card best">
      <h2>⭐ Nej odpověď</h2>
      {#if best.kind === 'estimate' && bestQuestion.type === 'estimate'}
        <p>
          <strong>{bestContestant.avatar} {bestContestant.name}</strong> odhadl(a) {formatNumber(Number(best.given))}
          {bestQuestion.unit} — správně je {formatNumber(bestQuestion.answer)} {bestQuestion.unit}
          {best.error === 0 ? '(přesně!)' : `(odchylka ${formatNumber(Math.round((best.error ?? 0) * 1000) / 10)} %)`}.
        </p>
      {:else}
        <p><strong>{bestContestant.avatar} {bestContestant.name}</strong> zvládl(a) nejtěžší otázku:</p>
      {/if}
      <p class="muted">„{bestQuestion.text}“</p>
    </section>
  {/if}

  {#if themesPlayed.length > 0}
    <section class="card">
      <h2>📊 Úspěšnost po tématech</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              {#each themesPlayed as t (t)}<th title={THEME_LABELS[t]}><span class="emoji">{THEME_EMOJI[t]}</span><span class="th-label">{THEME_LABELS[t]}</span></th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each game.config.contestants as c (c.id)}
              <tr>
                <th scope="row"><span class="emoji">{c.avatar}</span> {c.name}</th>
                {#each themesPlayed as t (t)}
                  {@const s = summary.themeStats[c.id]?.[t]}
                  <td>{s ? `${s.correct}/${s.total}` : '–'}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <div class="row actions">
    <button class="btn primary big" onclick={onNewGame}>🏠 Nová hra</button>
    <button class="btn big" onclick={onExport}>💾 Stáhnout historii</button>
  </div>
</article>

<style>
  .center {
    text-align: center;
  }
  .trophy {
    font-size: 5rem;
  }
  h1 {
    font-size: 2.6rem;
  }
  .best p {
    margin: 4px 0;
    font-size: 1.15rem;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 1.1rem;
  }
  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    text-align: center;
  }
  th[scope='row'] {
    text-align: left;
    white-space: nowrap;
  }
  thead th {
    font-size: 0.85rem;
    vertical-align: bottom;
  }
  .th-label {
    display: block;
    font-weight: 600;
  }
  .actions {
    justify-content: center;
  }
</style>
