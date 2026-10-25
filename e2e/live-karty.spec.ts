// Digital prší in a live room end to end: the TV seats one person and two computers, the phone
// shows only its own hand and plays (with hints, so the playable cards are marked), the computers
// move on the server, the game is played to the end and the result is in the test database.

import process from 'node:process';
import { expect, test, devices, type Page } from '@playwright/test';
import pg from 'pg';
import { createTestManager, loginManager, type TestManager } from './helpers/account.ts';

const databaseUrl = process.env.DATABASE_URL_TEST ?? '';
let db: pg.Client;
let manager: TestManager;

test.beforeAll(async () => {
  if (!databaseUrl.includes('_test')) throw new Error('DATABASE_URL_TEST must point to a *_test database');
  db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  manager = await createTestManager(db, 'E2E karty');
});

test.afterAll(async () => {
  if (manager?.householdId) await db.query('DELETE FROM households WHERE id = $1', [manager.householdId]);
  await db?.end();
});

/** One move of the person on the phone: a playable card (a svršek asks for the suit), else draw/stand. */
async function playTurn(page: Page): Promise<void> {
  const main = page.getByTestId('phone');
  const seq = await main.getAttribute('data-seq');
  const playable = page.locator('[data-testid="hand-card"][data-playable="true"]');
  if ((await playable.count()) > 0) {
    await playable.first().click();
    const suit = page.getByTestId('suit-choice');
    if (await suit.first().isVisible().catch(() => false)) await suit.first().click();
  } else {
    await page.getByTestId('fallback').click();
  }
  await expect(main).not.toHaveAttribute('data-seq', seq ?? '');
}

test('prší: TV, jeden telefon a dva počítače, dohraná partie, výsledek v DB', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const tvContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL });
  const tv = await tvContext.newPage();
  await loginManager(tv.request, manager);
  const res = await tv.request.post('/api/players', { data: { name: 'Táta', level: 'hospoda', avatar: '🐻' } });
  expect(res.status()).toBe(201);
  const tataId = (await res.json()).player.id as number;

  // ---- setup ----
  await tv.goto('/tv');
  await tv.getByRole('button', { name: /Prší/ }).click();
  await tv.getByRole('button', { name: 'Táta hraje' }).click();
  await tv.getByRole('button', { name: 'Nápovědy: Táta' }).click();
  await tv.getByRole('group', { name: 'Počet počítačů' }).getByRole('button', { name: '2', exact: true }).click();
  await tv.getByRole('group', { name: 'Síla počítače' }).getByRole('button', { name: 'Začátečník' }).click();
  await tv.getByRole('button', { name: 'Založit místnost' }).click();
  await expect(tv).toHaveURL(/\/tv\/[A-Z0-9]{4}$/);
  const tvMain = tv.getByTestId('tv-prsi');
  await expect(tvMain).toHaveAttribute('data-phase', 'lobby');
  await expect(tv.getByTestId('lobby-contestant')).toHaveCount(3);
  const code = (await tv.getByTestId('room-code').innerText()).trim();

  // ---- phone ----
  const phoneContext = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await phoneContext.newPage();
  await phone.goto(`${baseURL}/m/${code}`);
  // Only people can be picked, not the computers.
  await expect(phone.getByRole('button', { name: /^Jsem / })).toHaveCount(1);
  await phone.getByRole('button', { name: 'Jsem Táta' }).click();
  await expect(phone.getByTestId('waiting')).toBeVisible();
  await expect(tv.locator(`[data-testid="lobby-contestant"][data-contestant="p${tataId}"]`)).toHaveAttribute('data-online', 'yes');

  await tv.getByRole('button', { name: /Rozdat karty/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'playing');
  await expect(phone.getByTestId('hand-card')).toHaveCount(4);
  // The TV shows the table, never a hand.
  await expect(tv.getByTestId('hand-card')).toHaveCount(0);
  await expect(tv.getByTestId('tv-seat')).toHaveCount(3);

  // ---- play to the end ----
  const phoneMain = phone.getByTestId('phone');
  const until = Date.now() + 150_000;
  while (Date.now() < until) {
    if ((await tvMain.getAttribute('data-phase')) === 'finished') break;
    if ((await phoneMain.getAttribute('data-my-turn')) === 'yes') await playTurn(phone);
    else await phone.waitForTimeout(100);
  }
  await expect(tvMain).toHaveAttribute('data-phase', 'finished');
  await expect(tv.getByTestId('result')).toBeVisible();
  await expect(phone.getByTestId('final')).toBeVisible();

  // ---- database: only the person, place as at the table ----
  await expect
    .poll(async () => {
      const r = await db.query<{ status: string; game_type: string }>(
        `SELECT status, game_type FROM matches WHERE household_id = $1 AND room_code = $2 AND mode = 'live'`,
        [manager.householdId, code],
      );
      return r.rows[0] ? `${r.rows[0].game_type}/${r.rows[0].status}` : null;
    })
    .toBe('prsi/finished');
  const seats = await db.query<{ player_id: string; place: number }>(
    `SELECT mp.player_id, mp.place FROM match_participants mp JOIN matches m ON m.id = mp.match_id WHERE m.household_id = $1 AND m.room_code = $2`,
    [manager.householdId, code],
  );
  expect(seats.rows).toHaveLength(1);
  expect(Number(seats.rows[0].player_id)).toBe(tataId);
  const order = await tv.getByTestId('result').locator('ol li').allInnerTexts();
  expect(seats.rows[0].place).toBe(order.indexOf('Táta') + 1);

  await phoneContext.close();
  await tvContext.close();
});

test('žolíky: telefon líže a odhazuje, počítač odehraje svůj tah, stůl na TV', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const tvContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL });
  const tv = await tvContext.newPage();
  await loginManager(tv.request, manager);
  const res = await tv.request.post('/api/players', { data: { name: 'Anička', level: 'lavice', avatar: '🦊' } });
  expect(res.status()).toBe(201);

  await tv.goto('/tv?hra=zoliky-hra');
  await tv.getByRole('button', { name: 'Anička hraje' }).click();
  // A child gets hints by default.
  await expect(tv.getByRole('button', { name: 'Nápovědy: Anička' })).toHaveAttribute('aria-pressed', 'true');
  await tv.getByRole('group', { name: 'Počet kol' }).getByRole('button', { name: '1', exact: true }).click();
  await tv.getByRole('button', { name: 'Založit místnost' }).click();
  const tvMain = tv.getByTestId('tv-zoliky');
  await expect(tvMain).toHaveAttribute('data-phase', 'lobby');
  const code = (await tv.getByTestId('room-code').innerText()).trim();

  const phoneContext = await browser.newContext({ ...devices['Pixel 7'] });
  const phone = await phoneContext.newPage();
  await phone.goto(`${baseURL}/m/${code}`);
  await phone.getByRole('button', { name: 'Jsem Anička' }).click();
  await expect(phone.getByTestId('waiting')).toBeVisible();
  await tv.getByRole('button', { name: /Rozdat karty/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'playing');

  const main = phone.getByTestId('phone');
  // Anička (left of the dealer) starts with 16 cards: she discards first.
  await expect(main).toHaveAttribute('data-my-turn', 'yes');
  await expect(phone.getByTestId('owl')).toBeVisible();
  const cards = phone.getByTestId('hand-card');
  const before = await cards.count();
  if ((await main.getAttribute('data-step')) === 'draw') {
    await phone.getByRole('button', { name: 'Z balíčku' }).click();
    await expect(cards).toHaveCount(before + 1);
  }
  // The fan overlaps on a phone: the last card is the one fully on top.
  await cards.last().click();
  await phone.getByRole('button', { name: 'Odhodit' }).click();
  await expect(main).toHaveAttribute('data-my-turn', 'no');
  await expect(tv.getByTestId('discard').locator('svg')).toBeVisible();
  // The computer takes its whole turn on the server, then it is Anička's turn again.
  await expect(main).toHaveAttribute('data-my-turn', 'yes', { timeout: 20_000 });
  await expect(main).toHaveAttribute('data-step', 'draw');

  await phoneContext.close();
  await tvContext.close();
});
