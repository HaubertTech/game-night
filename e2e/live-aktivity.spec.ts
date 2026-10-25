// „Řekni, ukaž, nakresli“ end to end: TV (host) and two phones (the explainers of two teams),
// one round with a guessed and a skipped word, the finished match written to the test database.

import process from 'node:process';
import { expect, test, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { createTestManager, loginManager, type TestManager } from './helpers/account.ts';

const PLAYERS = [
  { name: 'Táta', level: 'hospoda', avatar: '🐻', team: 1 },
  { name: 'Máma', level: 'hospoda', avatar: '🦉', team: 1 },
  { name: 'Anička', level: 'lavice', avatar: '🦊', team: 2 },
  { name: 'Petr', level: 'hospoda', avatar: '🐸', team: 2 },
] as const;

const databaseUrl = process.env.DATABASE_URL_TEST ?? '';
let db: pg.Client;
let householdId: number;
let manager: TestManager;

test.beforeAll(async () => {
  if (!databaseUrl.includes('_test')) throw new Error('DATABASE_URL_TEST must point to a *_test database');
  db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  manager = await createTestManager(db, 'E2E aktivity');
  householdId = manager.householdId;
});

test.afterAll(async () => {
  if (householdId) await db.query('DELETE FROM households WHERE id = $1', [householdId]);
  await db?.end();
});

async function phone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return { context, page: await context.newPage() };
}

test('řekni, ukaž, nakresli: TV a dva telefony, dva týmy, uhodnuto a přeskočeno, zápis do DB', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);

  const tvContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL });
  const tv = await tvContext.newPage();
  await loginManager(tv.request, manager);
  const ids: Record<string, number> = {};
  for (const p of PLAYERS) {
    const res = await tv.request.post('/api/players', { data: { name: p.name, level: p.level, avatar: p.avatar } });
    expect(res.status()).toBe(201);
    ids[p.name] = (await res.json()).player.id;
  }

  // ---- setup: game card preselected by ?hra=, two teams from players, one round ----
  await tv.goto('/tv?hra=aktivity');
  await expect(tv.getByRole('button', { name: /Řekni, ukaž, nakresli/ })).toHaveAttribute('aria-pressed', 'true');
  for (const p of PLAYERS) {
    await tv.getByRole('group', { name: `Tým hráče ${p.name}` }).getByRole('button', { name: `Tým ${p.team}` }).click();
  }
  await tv.getByRole('group', { name: 'Čas na tah' }).getByRole('button', { name: '60 s' }).click();
  await tv.getByRole('group', { name: 'Konec hry' }).getByRole('button', { name: '1 kolo' }).click();
  await tv.getByRole('button', { name: 'Založit místnost' }).click();
  await expect(tv).toHaveURL(/\/tv\/[A-Z0-9]{4}$/);
  const tvMain = tv.getByTestId('tv-aktivity');
  await expect(tvMain).toHaveAttribute('data-phase', 'setup');
  const code = (await tv.getByTestId('room-code').innerText()).trim();

  // ---- the two explainers join ----
  const phones: Record<string, Page> = {};
  const contexts: BrowserContext[] = [];
  for (const name of ['Táta', 'Anička']) {
    const ph = await phone(browser);
    contexts.push(ph.context);
    phones[name] = ph.page;
    await ph.page.goto(`${baseURL}/m/${code}`);
    await expect(ph.page.getByTestId('picker')).toBeVisible();
    await ph.page.getByRole('button', { name: `Jsem ${name}` }).click();
    await expect(ph.page.getByTestId('waiting')).toBeVisible();
    await expect(tv.locator(`[data-testid="lobby-contestant"][data-contestant="p${ids[name]}"]`)).toHaveAttribute('data-online', 'yes');
  }

  await tv.getByRole('button', { name: 'Začít hru' }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'turnIntro');
  await expect(tv.getByTestId('explainer')).toContainText('Táta');

  // ---- turn 1: Táta picks 4 on the phone, only his phone sees the word, his team guesses it ----
  await phones['Táta'].getByRole('button', { name: /^4/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'playing');
  const word = (await phones['Táta'].getByTestId('secret-word').innerText()).trim();
  expect(word.length).toBeGreaterThan(0);
  await expect(tv.getByTestId('mode')).toBeVisible();
  await expect(tv.getByTestId('countdown')).toBeVisible();
  await expect(phones['Anička'].getByTestId('guess')).toBeVisible();
  await expect(phones['Anička'].getByTestId('secret-word')).toHaveCount(0);
  expect(await tv.locator('body').innerText()).not.toContain(word);
  expect(await phones['Anička'].locator('body').innerText()).not.toContain(word);

  await phones['Táta'].getByRole('button', { name: /Uhodli!/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'result');
  await expect(tv.getByTestId('outcome')).toHaveAttribute('data-outcome', 'guessed');
  await expect(tv.getByTestId('revealed-word')).toHaveText(word);
  await expect(phones['Anička'].getByTestId('turn-result')).toContainText(word);

  // ---- turn 2: Anička's team; the host skips the word on the TV ----
  await tv.getByRole('button', { name: /Další tah/ }).click();
  await expect(tv.getByTestId('explainer')).toContainText('Anička');
  await phones['Anička'].getByRole('button', { name: /^3/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'playing');
  await expect(phones['Anička'].getByTestId('secret-word')).toBeVisible();
  await tv.getByRole('button', { name: /Přeskočit/ }).click();
  await expect(tv.getByTestId('outcome')).toHaveAttribute('data-outcome', 'skipped');

  // ---- one round played → final standings ----
  await tv.getByRole('button', { name: /Další tah/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'finished');
  await expect(tv.getByTestId('final')).toContainText('Táta + Máma');
  await expect(phones['Anička'].getByTestId('final')).toBeVisible();

  // ---- database ----
  await expect
    .poll(async () => {
      const r = await db.query<{ status: string; game_type: string }>(
        `SELECT status, game_type FROM matches WHERE household_id = $1 AND room_code = $2 AND mode = 'live'`,
        [householdId, code],
      );
      return r.rows[0] ? `${r.rows[0].game_type}/${r.rows[0].status}` : null;
    })
    .toBe('aktivity/finished');
  const seats = await db.query<{ team_id: string | null; player_id: string | null; place: number; score: string }>(
    `SELECT mp.team_id, mp.player_id, mp.place, mp.score FROM match_participants mp JOIN matches m ON m.id = mp.match_id
      WHERE m.household_id = $1 AND m.room_code = $2 ORDER BY mp.place`,
    [householdId, code],
  );
  expect(seats.rows).toHaveLength(2);
  expect(seats.rows.every((r) => r.team_id !== null && r.player_id === null)).toBe(true);
  expect(seats.rows[0].place).toBe(1);
  expect(Number(seats.rows[0].score)).toBeGreaterThanOrEqual(3);
  const seen = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM seen_questions WHERE player_id = $1', [ids['Petr']]);
  expect(seen.rows[0].n).toBe(2);

  for (const c of contexts) await c.close();
  await tvContext.close();
});
