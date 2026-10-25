<script lang="ts">
  import Art from '#lib/ui/art/Art.svelte';
  import { THEME_ART } from '#lib/ui/art/art.ts';
  import Avatar from '#lib/ui/art/Avatar.svelte';
  import type { LiveView } from '../../live/protocol.ts';
  import { THEME_LABELS, type Question, type Theme } from '../../types.ts';
  import Standings from '../Standings.svelte';
  import { deviationLabel, formatEstimate } from '../labels.ts';
  import { contestantMap, standingRows } from './view-helpers.ts';

  let { view, questions, compact = false }: { view: LiveView; questions: Record<string, Question>; compact?: boolean } = $props();

  const rows = $derived(standingRows(view));
  const byId = $derived(contestantMap(view));
  const summary = $derived(view.summary);
  const winners = $derived(rows.filter((r) => r.place === 1));
  const themesPlayed = $derived(
    summary ? Array.from(new Set(Object.values(summary.themeStats).flatMap((s) => Object.keys(s) as Theme[]))) : [],
  );
  const best = $derived(summary?.best ?? null);
  const bestWho = $derived(best ? byId.get(best.contestantId) : undefined);
  const bestQ = $derived(best ? questions[best.questionId] : undefined);
</script>

<article class="final stack" data-testid="final">
  <header class="center">
    <Art name="rewards.vitez-vecera" size={140} class="trophy" eager />
    <h1>Konečné pořadí</h1>
    {#if winners.length}
      <p class="muted win">Vítězí {#each winners as w, i (w.contestant.id)}{i > 0 ? ' a ' : ''}<Avatar value={w.contestant.avatar} /> {w.contestant.name}{/each}!</p>
    {/if}
  </header>

  <Standings {rows} showRound={false} />

  {#if !compact && best && bestWho}
    <section class="card">
      <h2>⭐ Nej odpověď</h2>
      {#if best.kind === 'estimate' && bestQ?.type === 'estimate'}
        <p>
          <strong><Avatar value={bestWho.avatar} /> {bestWho.name}</strong> odhadl(a) {formatEstimate(Number(best.given), bestQ.unit)} — správně je
          {formatEstimate(bestQ.answer, bestQ.unit)} ({deviationLabel(bestQ, Number(best.given), bestQ.answer)}).
        </p>
      {:else}
        <p><strong><Avatar value={bestWho.avatar} /> {bestWho.name}</strong> zvládl(a) nejtěžší otázku.</p>
      {/if}
      {#if bestQ}<p class="muted">„{bestQ.text}“</p>{/if}
    </section>
  {/if}

  {#if !compact && summary && themesPlayed.length}
    <section class="card">
      <h2>📊 Úspěšnost po tématech</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              {#each themesPlayed as t (t)}<th title={THEME_LABELS[t]}><Art name={THEME_ART[t]} decorative size={40} class="th-icon" /> {THEME_LABELS[t]}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each view.contestants.filter((c) => !c.kicked) as c (c.id)}
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
  .center :global(.trophy) {
    width: 140px;
    height: 140px;
    margin: 0 auto 4px;
  }
  .win {
    font-size: 1.3rem;
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
    font-size: 0.9rem;
  }
</style>
