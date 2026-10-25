// Člověče, nezlob se on one tablet (no account): two people and a computer play a seeded short
// game to the end, and the owl's lesson can be finished step by step.

import { expect, test, type Page } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.goto('/clovece');
  await page.evaluate(() => localStorage.clear());
});

async function addPlayer(page: Page, name: string, level: string) {
  await page.getByLabel('Jméno dalšího hráče').fill(name);
  await page.getByRole('group', { name: 'Úroveň dalšího hráče' }).getByRole('button', { name: level }).click();
  await page.getByRole('button', { name: /Přidat/ }).click();
}

test('tablet: dva hráči a počítač dohrají kratší hru se seedem', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/clovece?seed=2026');
  await addPlayer(page, 'Ema', 'Pískoviště');
  await addPlayer(page, 'Táta', 'Hospoda');
  await expect(page.getByRole('button', { name: 'Ema hraje' })).toHaveAttribute('aria-pressed', 'true');
  // A child gets the owl's help by default.
  await expect(page.getByRole('button', { name: 'Nápovědy sovy: Ema' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Počet počítačů' }).getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: /Kratší hra/ }).click();
  await page.getByTestId('clovece-start').click();
  await expect(page).toHaveURL(/\/clovece\/hra$/);
  // Fast computer for the test.
  await page.goto('/clovece/hra?ai=0');

  const game = page.getByTestId('clovece-game');
  await expect(game).toHaveAttribute('data-phase', 'playing');
  await expect(page.getByTestId('clovece-player')).toHaveCount(3);
  await expect(page.getByTestId('owl')).toBeVisible();

  const until = Date.now() + 130_000;
  while (Date.now() < until) {
    if ((await game.getAttribute('data-phase')) === 'finished') break;
    const turn = await game.getAttribute('data-turn');
    if (turn?.startsWith('ai')) {
      await page.waitForTimeout(20);
      continue;
    }
    const seq = await game.getAttribute('data-seq');
    const roll = page.getByTestId('clovece-roll');
    if ((await game.getAttribute('data-stage')) === 'roll' && (await roll.isEnabled())) {
      await roll.click();
    } else {
      const pawns = page.locator('[data-testid="clovece-pawn"][data-movable="true"]');
      if ((await pawns.count()) === 0) {
        await page.waitForTimeout(20);
        continue;
      }
      await pawns.first().click();
    }
    await expect(game).not.toHaveAttribute('data-seq', seq ?? '');
  }
  await expect(game).toHaveAttribute('data-phase', 'finished');
  await expect(page.getByTestId('clovece-result')).toBeVisible();
  const places = await page.getByTestId('clovece-player').evaluateAll((els) => els.map((e) => e.getAttribute('data-place')).sort());
  expect(places).toEqual(['1', '2', '3']);
  // Without an account nothing is recorded.
  await expect(page.getByTestId('clovece-recorded')).toHaveCount(0);
});

test('lekce se sovou: kostka, nasazení, pohyb, vyhození a domeček', async ({ page }) => {
  await page.goto('/clovece/lekce');
  const lesson = page.getByTestId('clovece-lesson');
  for (const step of ['kostka', 'nasazeni', 'pohyb', 'vyhozeni', 'domecek']) {
    await expect(lesson).toHaveAttribute('data-step', step);
    await page.getByTestId('clovece-roll').click();
    if (step !== 'kostka') {
      const pawn = page.locator('[data-testid="clovece-pawn"][data-movable="true"]');
      await expect(pawn).toHaveCount(1);
      await pawn.click();
    }
    await expect(lesson).toHaveAttribute('data-done', 'yes');
    await page.getByTestId('clovece-lesson-next').click();
  }
  await expect(page.getByTestId('clovece-lesson-end')).toBeVisible();
  await expect(page.getByRole('link', { name: /Zahrát si/ })).toHaveAttribute('href', '/clovece');
});
