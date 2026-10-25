<script lang="ts">
  import Art from '#lib/ui/art/Art.svelte';
  import { THEME_ART } from '#lib/ui/art/art.ts';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import { THEME_LABELS, type Theme } from '../types.ts';
  import type { GameState, GameSummary } from '../engine/quiz.ts';
  import { deviationLabel, formatEstimate } from './labels.ts';
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
    <div class="trophies">
      <Art name="mascot.sova-slavi" alt="Sova slaví" size={120} class="trophy" eager />
      <Art name="rewards.vitez-vecera" alt="Pohár pro vítěze" size={120} class="trophy" eager />
    </div>
    <h1>Konečné pořadí</h1>
    <p class="muted">
      Vítězí {#each winners as w, i (w.contestant.id)}{i > 0 ? ' a ' : ''}<Avatar value={w.contestant.avatar} /> {w.contestant.name}{/each}!
    </p>
  </header>

  <Standings rows={summary.ranking} showRound={false} />

  {#if best && bestContestant && bestQuestion}
    <section class="card best">
      <h2>⭐ Nej odpověď</h2>
      {#if best.kind === 'estimate' && bestQuestion.type === 'estimate'}
        <p>
          <strong><Avatar value={bestContestant.avatar} /> {bestContestant.name}</strong> odhadl(a) {formatEstimate(Number(best.given), bestQuestion.unit)}
          {bestQuestion.unit === 'rok' ? '' : bestQuestion.unit} — správně je {formatEstimate(bestQuestion.answer, bestQuestion.unit)}
          {bestQuestion.unit === 'rok' ? '' : bestQuestion.unit} ({deviationLabel(bestQuestion, Number(best.given), bestQuestion.answer)}).
        </p>
      {:else}
        <p><strong><Avatar value={bestContestant.avatar} /> {bestContestant.name}</strong> zvládl(a) nejtěžší otázku:</p>
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
              {#each themesPlayed as t (t)}<th title={THEME_LABELS[t]}><Art name={THEME_ART[t]} decorative size={40} class="th-icon" /><span class="th-label">{THEME_LABELS[t]}</span></th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each game.config.contestants as c (c.id)}
              <tr>
                <th scope="row"><span class="emoji"><Avatar value={c.avatar} /></span> {c.name}</th>
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
  thead :global(.th-icon) {
    width: 40px;
    height: 40px;
    margin: 0 auto 2px;
  }
  .center {
    text-align: center;
  }
  .trophies {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: 8px;
  }
  .trophies :global(.trophy) {
    width: 120px;
    height: 120px;
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
