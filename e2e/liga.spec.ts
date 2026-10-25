// League flow against the test database: login, three players, a season, an evening with two prší
// games and one žolíky game → evening and season tables, player profile with ratings.

import process from 'node:process';
import pg from 'pg';
import { expect, test, type Page } from '@playwright/test';
import { databaseName } from '../src/lib/server/env.ts';
import { ensureDatabase, migrate } from '../src/lib/server/migrate.ts';
import { createTestManager, type TestManager } from './helpers/account.ts';

let manager: TestManager;

function testDbUrl(): string {
  try {
    process.loadEnvFile('.env');
  } catch {
    // variables may come from the environment
  }
  const url = process.env.DATABASE_URL_TEST ?? '';
  if (!url || !databaseName(url).includes('_test')) throw new Error('[e2e] DATABASE_URL_TEST with _test in the name is required');
  return url;
}

async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: testDbUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  const url = testDbUrl();
  await ensureDatabase(url);
  await migrate(url);
  manager = await withDb((c) => createTestManager(c, 'E2E liga'));
});

test.afterAll(async () => {
  if (manager) await withDb((c) => c.query('DELETE FROM households WHERE id = $1', [manager.householdId]));
});

function today(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
}

async function addPlayer(page: Page, name: string, level: 'Hospoda' | 'Lavice') {
  await page.getByLabel('Jméno').fill(name);
  await page.getByRole('group', { name: 'Úroveň', exact: true }).getByRole('button', { name: level }).click();
  await page.getByRole('button', { name: /Přidat hráče/ }).click();
  await expect(page.getByTestId('players').getByText(name, { exact: true })).toBeVisible();
}

async function playPrsi(page: Page, deals: string[][]) {
  await page.getByRole('button', { name: /Prší$/ }).click();
  await page.getByRole('button', { name: /Začít zápis/ }).click();
  await expect(page.getByTestId('prsi-sheet')).toBeVisible();
  const group = page.getByRole('group', { name: 'Pořadí partie' });
  for (const deal of deals) {
    // The last player is filled in automatically.
    for (const name of deal.slice(0, -1)) await group.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: /Zapsat partii/ }).click();
    await expect(page.getByText(`Zapsané partie (${deals.indexOf(deal) + 1})`)).toBeVisible();
  }
  await page.getByRole('button', { name: /Konec hry/ }).click();
  await expect(page.getByText('Výsledek je zapsaný do ligy.')).toBeVisible();
  await page.getByRole('link', { name: 'Zpět do večera' }).click();
}

async function typePoints(page: Page, digits: string) {
  const keypad = page.getByRole('group', { name: 'Klávesnice' });
  for (const d of digits) await keypad.getByRole('button', { name: d, exact: true }).click();
}

test('večer se dvěma partiemi prší a jedněmi žolíky → tabulka večera, sezóny a profil hráče', async ({ page }) => {
  page.on('dialog', (d) => d.accept());

  await page.goto('/');
  const login = page.getByTestId('login');
  await login.getByLabel('E-mail').fill(manager.email);
  await login.getByLabel('Heslo').fill(manager.password);
  await login.getByRole('button', { name: 'Přihlásit', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Nový večer/ })).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: /Hráči/ }).click();
  await addPlayer(page, 'Táta', 'Hospoda');
  await addPlayer(page, 'Máma', 'Hospoda');
  await addPlayer(page, 'Kuba', 'Lavice');

  // Season covering today, default points 10–7–5–3–2–1.
  await page.getByRole('navigation').getByRole('link', { name: /Liga/ }).click();
  await page.getByRole('button', { name: /Nová sezóna/ }).click();
  await page.getByLabel('Název', { exact: true }).fill('Testovací sezóna');
  const d = today();
  await page.getByLabel('Od', { exact: true }).fill(`${d.slice(0, 4)}-01-01`);
  await page.getByLabel('Do', { exact: true }).fill(`${d.slice(0, 4)}-12-31`);
  await page.getByRole('button', { name: 'Založit sezónu' }).click();
  await expect(page.getByRole('button', { name: 'Testovací sezóna' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('navigation').getByRole('link', { name: /Večery/ }).click();
  await page.getByLabel('Název (nepovinné)').fill('Sobotní liga');
  await page.getByRole('button', { name: /Založit večer/ }).click();
  await expect(page.getByRole('heading', { name: /Sobotní liga/ })).toBeVisible();
  await expect(page.getByText(/sezóna Testovací sezóna/)).toBeVisible();

  // Prší 1: Táta 1+2 = 3, Kuba 3+1 = 4, Máma 2+3 = 5 → Táta 10, Kuba 7, Máma 5.
  await playPrsi(page, [['Táta', 'Máma', 'Kuba'], ['Kuba', 'Táta', 'Máma']]);
  // Prší 2: Máma 10, Táta 7, Kuba 5.
  await playPrsi(page, [['Máma', 'Táta', 'Kuba']]);

  // Žolíky: round 1 Táta zavřel (Máma 25, Kuba 40); round 2 Kuba z ruky (Táta 10×2, Máma 5×2).
  await page.getByRole('button', { name: /Žolíky$/ }).click();
  await page.getByRole('button', { name: /Začít zápis/ }).click();
  await expect(page.getByTestId('zoliky-sheet')).toBeVisible();
  const closer = page.getByRole('group', { name: 'Kdo zavřel' });
  await closer.getByRole('button', { name: 'Táta', exact: true }).click();
  await page.getByRole('button', { name: 'Body Máma' }).click();
  await typePoints(page, '25');
  // Moves to the next field without points (Kuba).
  await page.getByRole('button', { name: 'Další hráč' }).click();
  await typePoints(page, '40');
  await page.getByRole('button', { name: /Zapsat kolo/ }).click();
  await expect(page.getByRole('heading', { name: /kolo 2/ })).toBeVisible();

  await closer.getByRole('button', { name: 'Kuba', exact: true }).click();
  await page.getByRole('button', { name: /Zavřel z ruky/ }).click();
  await page.getByRole('button', { name: 'Body Táta' }).click();
  await typePoints(page, '10');
  await page.getByRole('button', { name: 'Body Máma' }).click();
  await typePoints(page, '5');
  await page.getByRole('button', { name: /Zapsat kolo/ }).click();
  await expect(page.getByTestId('zoliky-total')).toHaveText(['40', '35', '20']); // columns by name: Kuba, Máma, Táta
  await page.getByRole('button', { name: /Konec hry/ }).click();
  await expect(page.getByText('Výsledek je zapsaný do ligy.')).toBeVisible();
  await expect(page.getByTestId('zoliky-ranking').locator('li').first()).toContainText('Táta');
  await page.getByRole('link', { name: 'Zpět do večera' }).click();

  // Evening: Táta 10 + 7 + 10 = 27, Máma 5 + 10 + 7 = 22, Kuba 7 + 5 + 5 = 17.
  await expect(page.getByTestId('night-matches').locator('> li')).toHaveCount(3);
  const nightRows = page.getByTestId('night-table').locator('tbody tr');
  await expect(nightRows).toHaveCount(3);
  await expect(nightRows.nth(0)).toContainText('Táta');
  await expect(nightRows.nth(0).getByTestId('points')).toHaveText('27');
  await expect(nightRows.nth(1).getByTestId('points')).toHaveText('22');
  await expect(nightRows.nth(2).getByTestId('points')).toHaveText('17');
  await expect(page.getByTestId('best-player')).toContainText('Táta');

  await page.getByRole('navigation').getByRole('link', { name: /Liga/ }).click();
  const seasonRows = page.getByTestId('season-table').locator('tbody tr');
  await expect(seasonRows).toHaveCount(3);
  await expect(seasonRows.nth(0)).toContainText('Táta');
  await expect(seasonRows.nth(0).getByTestId('points')).toHaveText('27');
  await expect(page.getByTestId('ratings-table').or(page.getByText('Zatím bez hodnocené partie.'))).toBeVisible();

  await seasonRows.nth(0).getByRole('link', { name: 'Táta' }).click();
  await expect(page.getByRole('heading', { name: 'Táta' })).toBeVisible();
  await expect(page.getByTestId('rating-prsi')).toContainText('2 hodnocené partie');
  await expect(page.getByTestId('rating-zoliky')).toContainText('1 hodnocená partie');
  await expect(page.getByTestId('league-points')).toHaveText('27');
  await expect(page.getByTestId('history').locator('tbody tr')).toHaveCount(3);
});
