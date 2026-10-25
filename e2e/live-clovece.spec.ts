// Člověče, nezlob se in a live room end to end: the TV seats one person and a computer, the phone
// rolls and picks pawns, the computer moves on the server, the game is played to the end and the
// result is in the test database (the person only, place as at the whole table).

import process from 'node:process';
import { expect, test, devices } from '@playwright/test';
import pg from 'pg';
import { createTestManager, loginManager, type TestManager } from './helpers/account.ts';

const databaseUrl = process.env.DATABASE_URL_TEST ?? '';
let db: pg.Client;
let manager: TestManager;

test.beforeAll(async () => {
  if (!databaseUrl.includes('_test')) throw new Error('DATABASE_URL_TEST must point to a *_test database');
  db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  manager = await createTestManager(db, 'E2E člověče');
});

test.afterAll(async () => {
  if (manager?.householdId) await db.query('DELETE FROM households WHERE id = $1', [manager.householdId]);
  await db?.end();
});

test('Člověče: TV, jeden telefon a počítač, dohraná hra, výsledek v DB', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const tvContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL, reducedMotion: 'reduce' });
  const tv = await tvContext.newPage();
  await loginManager(tv.request, manager);
  const res = await tv.request.post('/api/players', { data: { name: 'Ema', level: 'piskoviste', avatar: '🦊' } });
  expect(res.status()).toBe(201);
  const emaId = (await res.json()).player.id as number;

  // ---- setup ----
  await tv.goto('/tv');
  await tv.getByTestId('game-clovece').click();
  await tv.getByRole('button', { name: 'Ema hraje' }).click();
  await expect(tv.getByRole('button', { name: 'Nápovědy: Ema' })).toHaveAttribute('aria-pressed', 'true');
  await tv.getByRole('group', { name: 'Počet počítačů' }).getByRole('button', { name: '1', exact: true }).click();
  await tv.getByRole('button', { name: /Kratší hra/ }).click();
  await tv.getByRole('button', { name: 'Založit místnost' }).click();
  await expect(tv).toHaveURL(/\/tv\/[A-Z0-9]{4}$/);
  const tvMain = tv.getByTestId('tv-clovece');
  await expect(tvMain).toHaveAttribute('data-phase', 'lobby');
  await expect(tv.getByTestId('lobby-contestant')).toHaveCount(2);
  const code = (await tv.getByTestId('room-code').innerText()).trim();

  // ---- phone ----
  const phoneContext = await browser.newContext({ ...devices['Pixel 7'], reducedMotion: 'reduce' });
  const phone = await phoneContext.newPage();
  await phone.goto(`${baseURL}/m/${code}`);
  await expect(phone.getByRole('button', { name: /^Jsem / })).toHaveCount(1);
  await phone.getByRole('button', { name: 'Jsem Ema' }).click();
  await expect(phone.getByTestId('waiting')).toBeVisible();
  await expect(tv.locator(`[data-testid="lobby-contestant"][data-contestant="p${emaId}"]`)).toHaveAttribute('data-online', 'yes');

  await tv.getByRole('button', { name: /Začít hru/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'playing');
  await expect(tv.getByTestId('clovece-board')).toBeVisible();
  // The TV never offers the die as a button.
  await expect(tv.getByTestId('clovece-roll')).toHaveCount(0);

  // ---- play to the end ----
  const main = phone.getByTestId('phone');
  let advised = false;
  const until = Date.now() + 220_000;
  while (Date.now() < until) {
    if ((await tvMain.getAttribute('data-phase')) === 'finished') break;
    if ((await main.getAttribute('data-my-turn')) !== 'yes') {
      await phone.waitForTimeout(80);
      continue;
    }
    const seq = await main.getAttribute('data-seq');
    if ((await main.getAttribute('data-stage')) === 'roll') {
      await phone.getByTestId('clovece-roll').click();
    } else {
      if (!advised) {
        // The owl's advice for a child names a reason.
        await phone.getByTestId('clovece-advise').click();
        await expect(phone.getByTestId('owl')).not.toContainText('Hraje');
        advised = true;
      }
      await phone.getByTestId('clovece-move').first().click();
    }
    await expect(main).not.toHaveAttribute('data-seq', seq ?? '', { timeout: 10_000 });
  }
  await expect(tvMain).toHaveAttribute('data-phase', 'finished');
  await expect(tv.getByTestId('result')).toBeVisible();
  await expect(phone.getByTestId('final')).toBeVisible();

  // ---- database ----
  await expect
    .poll(async () => {
      const r = await db.query<{ status: string; game_type: string }>(
        `SELECT status, game_type FROM matches WHERE household_id = $1 AND room_code = $2 AND mode = 'live'`,
        [manager.householdId, code],
      );
      return r.rows[0] ? `${r.rows[0].game_type}/${r.rows[0].status}` : null;
    })
    .toBe('clovece/finished');
  const seats = await db.query<{ player_id: string; place: number }>(
    `SELECT mp.player_id, mp.place FROM match_participants mp JOIN matches m ON m.id = mp.match_id WHERE m.household_id = $1 AND m.room_code = $2`,
    [manager.householdId, code],
  );
  expect(seats.rows).toHaveLength(1);
  expect(Number(seats.rows[0].player_id)).toBe(emaId);
  const order = await tv.getByTestId('result').locator('ol li').allInnerTexts();
  expect(seats.rows[0].place).toBe(order.indexOf('Ema') + 1);

  // The league names the game in Czech.
  await tv.goto('/liga');
  await expect(tv.getByRole('button', { name: /Člověče, nezlob se/ }).first()).toBeVisible();

  await phoneContext.close();
  await tvContext.close();
});

test('Člověče: dítě bez telefonu hraje na TV, hostitel hází a táhne za něj', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const tvContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL, reducedMotion: 'reduce' });
  const tv = await tvContext.newPage();
  await loginManager(tv.request, manager);
  const res = await tv.request.post('/api/players', { data: { name: 'Bára', level: 'kocarek', avatar: '🐰' } });
  expect(res.status()).toBe(201);
  const baraId = (await res.json()).player.id as number;

  await tv.goto('/tv');
  await tv.getByTestId('game-clovece').click();
  await tv.getByRole('button', { name: 'Bára hraje' }).click();
  await tv.getByRole('button', { name: 'Na televizi: Bára' }).click();
  await tv.getByRole('group', { name: 'Počet počítačů' }).getByRole('button', { name: '1', exact: true }).click();
  await tv.getByRole('button', { name: 'Založit místnost' }).click();
  await expect(tv).toHaveURL(/\/tv\/[A-Z0-9]{4}$/);
  const tvMain = tv.getByTestId('tv-clovece');
  const seat = tv.locator(`[data-testid="lobby-contestant"][data-contestant="p${baraId}"]`);
  await expect(seat).toHaveAttribute('data-online', 'yes');
  await expect(seat).toContainText('hraje na televizi');
  const code = (await tv.getByTestId('room-code').innerText()).trim();

  // The phone has no seat to pick: Bára plays on the TV.
  const phoneContext = await browser.newContext({ ...devices['Pixel 7'], reducedMotion: 'reduce' });
  const phone = await phoneContext.newPage();
  await phone.goto(`${baseURL}/m/${code}`);
  await expect(phone.getByTestId('phone')).toBeVisible();
  await expect(phone.getByRole('button', { name: /^Jsem / })).toHaveCount(0);
  await phoneContext.close();

  await tv.getByRole('button', { name: /Začít hru/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'playing');

  // Three of Bára's turns played from the TV: roll, then the advised pawn when there is a choice.
  let turns = 0;
  const until = Date.now() + 70_000;
  while (turns < 3 && Date.now() < until) {
    if ((await tvMain.getAttribute('data-turn')) !== `p${baraId}`) {
      await tv.waitForTimeout(80);
      continue;
    }
    const seq = await tvMain.getAttribute('data-seq');
    if ((await tvMain.getAttribute('data-stage')) === 'roll') {
      await tv.getByTestId('clovece-roll').click();
      turns++;
    } else {
      await tv.getByTestId('tv-clovece-move').first().click();
    }
    await expect(tvMain).not.toHaveAttribute('data-seq', seq ?? '');
  }
  expect(turns).toBe(3);
  await tvContext.close();
});
