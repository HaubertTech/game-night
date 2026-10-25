// Chess in a live room end to end: the TV sets up white, black and the clock, two phones join,
// the scholar mate (šustr) is played on the phones, the TV shows board, clocks and moves, and the
// finished game is in the test database.

import process from 'node:process';
import { expect, test, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { createTestManager, loginManager, type TestManager } from './helpers/account.ts';

const databaseUrl = process.env.DATABASE_URL_TEST ?? '';
let db: pg.Client;
let manager: TestManager;

test.beforeAll(async () => {
  if (!databaseUrl.includes('_test')) throw new Error('DATABASE_URL_TEST must point to a *_test database');
  db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  manager = await createTestManager(db, 'E2E šachy');
});

test.afterAll(async () => {
  if (manager?.householdId) await db.query('DELETE FROM households WHERE id = $1', [manager.householdId]);
  await db?.end();
});

async function phone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return { context, page: await context.newPage() };
}

async function move(page: Page, uci: string) {
  const board = page.getByTestId('chess-board');
  await board.locator(`[data-square="${uci.slice(0, 2)}"]`).click();
  await board.locator(`[data-square="${uci.slice(2, 4)}"]`).click();
}

test('šachy: TV a dva telefony, šustr, výsledek v DB', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const tvContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL });
  const tv = await tvContext.newPage();
  await loginManager(tv.request, manager);
  const ids: Record<string, number> = {};
  for (const p of [
    { name: 'Táta', level: 'hospoda', avatar: '🐻' },
    { name: 'Kuba', level: 'lavice', avatar: '🦊' },
  ]) {
    const res = await tv.request.post('/api/players', { data: p });
    expect(res.status()).toBe(201);
    ids[p.name] = (await res.json()).player.id;
  }

  // ---- setup: game card, white, black, clock ----
  await tv.goto('/tv');
  await tv.getByRole('button', { name: /Šachy/ }).click();
  await tv.getByRole('group', { name: 'Bílé' }).getByRole('button', { name: /Táta/ }).click();
  await tv.getByRole('group', { name: 'Černé' }).getByRole('button', { name: /Kuba/ }).click();
  await tv.getByRole('group', { name: 'Hodiny' }).getByRole('button', { name: '5 minut' }).click();
  await tv.getByRole('button', { name: 'Založit místnost' }).click();
  await expect(tv).toHaveURL(/\/tv\/[A-Z0-9]{4}$/);
  const tvMain = tv.getByTestId('tv-chess');
  await expect(tvMain).toHaveAttribute('data-phase', 'lobby');
  const code = (await tv.getByTestId('room-code').innerText()).trim();

  // ---- phones ----
  const contexts: BrowserContext[] = [];
  const phones: Record<string, Page> = {};
  for (const name of ['Táta', 'Kuba']) {
    const ph = await phone(browser);
    contexts.push(ph.context);
    phones[name] = ph.page;
    await ph.page.goto(`${baseURL}/m/${code}`);
    await ph.page.getByRole('button', { name: `Jsem ${name}` }).click();
    await expect(ph.page.getByTestId('chess-board')).toBeVisible();
    await expect(tv.locator(`[data-testid="lobby-contestant"][data-contestant="p${ids[name]}"]`)).toHaveAttribute('data-online', 'yes');
  }
  await expect(phones['Táta'].getByTestId('phone')).toHaveAttribute('data-color', 'w');
  await expect(phones['Kuba'].getByTestId('phone')).toHaveAttribute('data-color', 'b');
  await expect(phones['Táta'].getByTestId('chess-status')).toContainText('Jsi na tahu');
  await expect(tv.getByTestId('clock-w')).toHaveText('5:00');

  // Black cannot move first.
  await move(phones['Kuba'], 'e7e5');
  await expect(phones['Kuba'].getByTestId('chess-board')).toHaveAttribute('data-fen', /^rnbqkbnr\/pppppppp/);

  // ---- scholar mate ----
  const moves = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
  for (const [i, uci] of moves.entries()) {
    const page = i % 2 ? phones['Kuba'] : phones['Táta'];
    await expect(page.getByTestId('chess-status')).toContainText('Jsi na tahu');
    await move(page, uci);
    await expect(tv.getByTestId('move-list').locator('li')).toHaveCount(Math.floor(i / 2) + 1);
  }
  await expect(tvMain).toHaveAttribute('data-phase', 'finished');
  await expect(tv.getByTestId('chess-result')).toContainText('Mat! Vyhrává Táta');
  await expect(tv.getByTestId('move-list')).toContainText('Qxf7#');
  await expect(phones['Kuba'].getByTestId('chess-result')).toBeVisible();

  // ---- database ----
  await expect
    .poll(async () => {
      const r = await db.query<{ status: string; game_type: string }>(
        `SELECT status, game_type FROM matches WHERE household_id = $1 AND room_code = $2 AND mode = 'live'`,
        [manager.householdId, code],
      );
      return r.rows[0] ? `${r.rows[0].game_type}/${r.rows[0].status}` : null;
    })
    .toBe('chess/finished');
  const seats = await db.query<{ player_id: string; place: number; score: string }>(
    `SELECT mp.player_id, mp.place, mp.score FROM match_participants mp JOIN matches m ON m.id = mp.match_id
      WHERE m.household_id = $1 AND m.room_code = $2 ORDER BY mp.place`,
    [manager.householdId, code],
  );
  expect(seats.rows.map((r) => [Number(r.player_id), r.place, Number(r.score)])).toEqual([
    [ids['Táta'], 1, 1],
    [ids['Kuba'], 2, 0],
  ]);

  for (const c of contexts) await c.close();
  await tvContext.close();
});
