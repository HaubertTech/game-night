import { expect, test, type Page } from '@playwright/test';

// Training mode (prší, žolíky against the computer). Runs in the browser only, no database.
// `?rychle=1` makes the computer seats move without the animation delay.

async function solveLesson(page: Page, game: 'prsi' | 'zoliky') {
  await page.goto(`/trenink/${game}/lekce`);
  const lesson = page.getByTestId('lesson');
  for (let guard = 0; guard < 40; guard++) {
    if (await page.getByTestId('lesson-finish').isVisible()) break;
    if ((await lesson.getAttribute('data-done')) !== 'true') {
      const type = await page.getByTestId('task').getAttribute('data-type');
      const targets = type === 'choice' || type === 'count' ? page.getByTestId('task-option') : page.getByTestId('hand-card');
      const n = await targets.count();
      for (let i = 0; i < n && (await lesson.getAttribute('data-done')) !== 'true'; i++) {
        await targets.nth(i).click();
      }
      await expect(lesson).toHaveAttribute('data-done', 'true');
    }
    const step = await lesson.getAttribute('data-step');
    await page.getByTestId('lesson-next').click();
    await expect(lesson).not.toHaveAttribute('data-step', step ?? '');
  }
  await page.getByTestId('lesson-finish').click();
  await expect(page).toHaveURL(new RegExp(`/trenink/${game}$`));
}

async function startGame(page: Page, game: 'prsi' | 'zoliky', opponents: number) {
  await page.goto(`/trenink/${game}`);
  await page.getByRole('group', { name: 'Počet soupeřů' }).getByRole('button', { name: String(opponents), exact: true }).click();
  await page.getByRole('button', { name: 'Začít hru' }).click();
  await expect(page).toHaveURL(new RegExp(`/trenink/${game}/hra`));
  await page.goto(`/trenink/${game}/hra?rychle=1`);
}

test('rozcestník Trénink vede na prší a žolíky', async ({ page }) => {
  await page.goto('/trenink');
  await expect(page.getByRole('heading', { name: 'Trénink' })).toBeVisible();
  await page.getByTestId('trenink-prsi').click();
  await expect(page.getByRole('heading', { name: 'Prší', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Začít lekci' })).toBeVisible();
});

test('lekce prší se dá dokončit', async ({ page }) => {
  await solveLesson(page, 'prsi');
});

test('partie prší proti počítači se dohraje', async ({ page }) => {
  test.setTimeout(120_000);
  await startGame(page, 'prsi', 1);
  const table = page.getByTestId('prsi-table');
  await expect(table).toBeVisible();
  for (let guard = 0; guard < 400; guard++) {
    const phase = await table.getAttribute('data-phase');
    if (phase === 'finished') break;
    if ((await table.getAttribute('data-turn')) !== 'ja' || phase !== 'playing') {
      await page.waitForTimeout(60);
      continue;
    }
    const before = await table.getAttribute('data-my-cards');
    const playable = page.locator('[data-testid="hand-card"][data-playable="true"]');
    if (await playable.count()) {
      await playable.first().click();
      if (await page.getByTestId('suit-choice').first().isVisible()) await page.getByTestId('suit-choice').first().click();
    } else {
      await page.getByTestId('fallback').click();
    }
    await expect
      .poll(async () => `${await table.getAttribute('data-turn')}|${await table.getAttribute('data-my-cards')}`)
      .not.toBe(`ja|${before}`);
  }
  await expect(table).toHaveAttribute('data-phase', 'finished');
  await expect(page.getByTestId('result')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hrát znovu' })).toBeVisible();
});

test('žolíky: první vyložení s nápovědou „Najdi kombinace“', async ({ page }) => {
  test.setTimeout(180_000);
  await startGame(page, 'zoliky', 1);
  const table = page.getByTestId('zoliky-table');
  await expect(table).toBeVisible();
  for (let guard = 0; guard < 300; guard++) {
    if ((await table.getAttribute('data-opened')) === 'true') break;
    const phase = await table.getAttribute('data-phase');
    if (phase === 'roundEnd') {
      await page.getByRole('button', { name: 'Další kolo' }).click();
      continue;
    }
    if (phase !== 'playing' || (await table.getAttribute('data-turn')) !== 'ja') {
      await page.waitForTimeout(60);
      continue;
    }
    if ((await table.getAttribute('data-step')) === 'draw') {
      await page.getByRole('button', { name: 'Z balíčku', exact: true }).click();
      await expect(table).toHaveAttribute('data-step', 'play');
    }
    await page.getByRole('button', { name: 'Najdi kombinace' }).click();
    if (await page.getByTestId('staged').isVisible()) {
      await expect(page.getByTestId('opening-points')).toContainText('/ 42 bodů');
      await page.getByRole('button', { name: 'Vyložit', exact: true }).click();
      await expect(table).toHaveAttribute('data-opened', 'true');
      await expect(page.getByTestId('table-meld').first()).toBeVisible();
      break;
    }
    // Nothing to lay down yet: discard the card the owl advises.
    await page.getByRole('button', { name: 'Poraď' }).click();
    const advised = page.locator('[data-testid="hand-card"].advised');
    // Cards overlap in the fan: tap the visible left edge.
    await (await advised.count() ? advised.first() : page.getByTestId('hand-card').last()).click({ position: { x: 14, y: 50 } });
    const cards = await page.getByTestId('hand-card').count();
    await page.getByRole('button', { name: 'Odhodit' }).click();
    await expect
      .poll(async () => `${await table.getAttribute('data-step')}|${await page.getByTestId('hand-card').count()}`)
      .not.toBe(`play|${cards}`);
  }
  await expect(table).toHaveAttribute('data-opened', 'true');
});
