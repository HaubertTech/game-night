import { Chess } from 'chess.js';
import { expect, test, type Page } from '@playwright/test';

async function move(page: Page, uci: string) {
  const board = page.getByTestId('chess-board').first();
  await board.locator(`[data-square="${uci.slice(0, 2)}"]`).click();
  await board.locator(`[data-square="${uci.slice(2, 4)}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/sachy');
  await page.evaluate(() => localStorage.clear());
});

test('rozcestník nabízí čtyři cesty', async ({ page }) => {
  await page.goto('/sachy');
  for (const name of ['Hrát s počítačem', 'Dva hráči u tabletu', 'Učení', 'Úlohy']) {
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  }
});

test('lekce věže se dá dokončit', async ({ page }) => {
  await page.goto('/sachy/uceni');
  await page.getByTestId('lesson-vez').click();
  await page.getByRole('button', { name: 'Jdeme na to!' }).click();
  const lesson = page.getByTestId('lesson');

  await expect(lesson).toHaveAttribute('data-step', 'hvezdicky');
  for (const m of ['a1a6', 'a6f6', 'f6f2']) await move(page, m);
  await expect(lesson).toHaveAttribute('data-done', 'true');
  await page.getByRole('button', { name: /Další krok/ }).click();

  await expect(lesson).toHaveAttribute('data-step', 'ctyri-rohy');
  for (const m of ['d4d8', 'd8h8', 'h8h1', 'h1a1']) await move(page, m);
  await page.getByRole('button', { name: /Další krok/ }).click();

  await expect(lesson).toHaveAttribute('data-step', 'seber-pesce');
  // A wrong move first: the owl gives the hint and the board stays.
  await move(page, 'a1b1');
  for (const m of ['b1a1', 'a1a5', 'a5e5', 'e5e2']) await move(page, m);
  await expect(page.getByTestId('lesson-finished')).toBeVisible();

  await page.goto('/sachy/uceni');
  await expect(page.getByTestId('lesson-vez')).toContainText('hotovo');
});

test('partie proti počítači: několik tahů', async ({ page }) => {
  await page.goto('/sachy/pocitac');
  await page.getByRole('button', { name: /1\. Kuřátko/ }).click();
  await page.getByRole('button', { name: /Bílé/ }).click();
  await page.getByRole('button', { name: 'Začít partii' }).click();
  await expect(page).toHaveURL(/\/sachy\/hra\?m=ai/);

  const board = page.getByTestId('chess-board');
  const preferred = ['e2e4', 'g1f3', 'b1c3', 'd2d3', 'f1e2', 'e1g1', 'h2h3', 'a2a3'];
  for (let i = 0; i < 4; i++) {
    await expect(board).toHaveAttribute('data-turn', 'w', { timeout: 15_000 });
    await expect(page.getByTestId('chess-status')).toContainText('Na tahu', { timeout: 15_000 });
    const fen = (await board.getAttribute('data-fen')) ?? '';
    const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to);
    const uci = preferred.find((m) => legal.includes(m)) ?? legal[0];
    await move(page, uci);
    // A gentle blunder warning may pause the game.
    const keep = page.getByRole('button', { name: 'Hrát dál' });
    await expect(board).toHaveAttribute('data-turn', 'w', { timeout: 15_000 }).catch(async () => {
      if (await keep.isVisible()) await keep.click();
    });
    if (await keep.isVisible()) await keep.click();
  }
  await expect(board).toHaveAttribute('data-turn', 'w', { timeout: 15_000 });
  await expect(page.getByTestId('move-list').locator('li')).toHaveCount(4);

  // The game survives a reload.
  await page.reload();
  await expect(page.getByTestId('move-list').locator('li')).toHaveCount(4);
});

test('dva hráči: mat ve čtyřech tazích (šustr)', async ({ page }) => {
  await page.goto('/sachy/dva');
  await page.getByRole('button', { name: 'Začít partii' }).click();
  await expect(page).toHaveURL(/\/sachy\/hra\?m=local/);
  for (const m of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']) await move(page, m);
  await expect(page.getByTestId('chess-result')).toContainText('Mat! Vyhrává Bílý.');
  await expect(page.getByTestId('chess-game')).toHaveAttribute('data-result', 'checkmate');
});

test('úloha mat jedním tahem', async ({ page }) => {
  await page.goto('/sachy/ulohy');
  await page.getByTestId('puzzle-mate1-01').click();
  const fen = (await page.getByTestId('chess-board').getAttribute('data-fen')) ?? '';
  const chess = new Chess(fen);
  const mate = chess.moves({ verbose: true }).find((m) => {
    chess.move(m);
    const ok = chess.isCheckmate();
    chess.undo();
    return ok;
  })!;
  await move(page, mate.from + mate.to);
  await expect(page.getByTestId('puzzle')).toHaveAttribute('data-solved', 'true');
});
