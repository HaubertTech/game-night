<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import GameScreen from '#lib/ui/chess/GameScreen.svelte';
  import { leaguePlayerId, loadAiSetup, loadGame, loadLocalLeague, type SavedMode } from '#lib/ui/chess/storage.ts';
  import type { ChessState } from '#lib/games/chess/engine.ts';

  const mode: SavedMode = page.url.searchParams.get('m') === 'local' ? 'local' : 'ai';
  let game = $state<ChessState | null>(null);
  let hints = $state(true);
  let leagueNote = $state<{ ok: boolean; text: string } | null>(null);

  /** Two household players on the tablet: the finished game goes to the league (never vs the computer). */
  async function record(state: ChessState) {
    if (mode !== 'local' || !loadLocalLeague()) return;
    const whiteId = leaguePlayerId(state.players.w.id);
    const blackId = leaguePlayerId(state.players.b.id);
    if (whiteId === null || blackId === null) return;
    try {
      const res = await fetch('/api/matches/chess', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game: state, white_id: whiteId, black_id: blackId }),
      });
      const body = await res.json().catch(() => null);
      leagueNote = res.ok ? { ok: true, text: '🏆 Zapsáno do ligy.' } : { ok: false, text: `Do ligy se nezapsalo: ${body?.message ?? res.status}` };
    } catch (err) {
      leagueNote = { ok: false, text: `Do ligy se nezapsalo: ${(err as Error).message}` };
    }
  }

  onMount(() => {
    game = loadGame(mode);
    hints = mode === 'ai' ? loadAiSetup().hints : true;
    if (!game) goto(mode === 'ai' ? '/sachy/pocitac' : '/sachy/dva', { replaceState: true });
  });
</script>

<svelte:head><title>Partie · Šachy</title></svelte:head>

<main class="page">
  {#if game}
    {#if leagueNote}<p class="league" class:bad={!leagueNote.ok} data-testid="league-recorded" role="status">{leagueNote.text}</p>{/if}
    <GameScreen initial={game} {mode} hintsEnabled={hints} onexit={() => goto('/sachy')} onfinished={record} />
  {/if}
</main>

<style>
  .league {
    margin: 0 0 12px;
    font-weight: 800;
  }
  .league.bad {
    color: var(--bad);
  }
</style>
