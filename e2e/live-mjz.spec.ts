// „Město, jméno, zvíře“ end to end: TV (host) and three phones, one round ended by Stop!,
// a challenged answer voted down, the host's ruling, and the finished match in the test database.

import process from 'node:process';
import { expect, test, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { createTestManager, loginManager, type TestManager } from './helpers/account.ts';

const PLAYERS = [
  { name: 'Táta', level: 'hospoda', avatar: '🐻' },
  { name: 'Máma', level: 'hospoda', avatar: '🦉' },
  { name: 'Anička', level: 'lavice', avatar: '🦊' },
] as const;
const CATEGORIES = ['Město', 'Jméno', 'Zvíře', 'Věc', 'Rostlina', 'Řeka/Hora'];

const databaseUrl = process.env.DATABASE_URL_TEST ?? '';
let db: pg.Client;
let householdId: number;
let manager: TestManager;

test.beforeAll(async () => {
  if (!databaseUrl.includes('_test')) throw new Error('DATABASE_URL_TEST must point to a *_test database');
  db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  manager = await createTestManager(db, 'E2E mjz');
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

test('město, jméno, zvíře: TV a tři telefony, Stop!, napadení a hlasování, zápis do DB', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);

  const tvContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL });
  const tv = await tvContext.newPage();
  await loginManager(tv.request, manager);
  const ids: Record<string, number> = {};
  for (const p of PLAYERS) {
    const res = await tv.request.post('/api/players', { data: p });
    expect(res.status()).toBe(201);
    ids[p.name] = (await res.json()).player.id;
  }
  const cid = (name: string) => `p${ids[name]}`;

  // ---- setup on the TV: pick the game card, players, one round ----
  await tv.goto('/tv');
  await tv.getByRole('button', { name: /Město-jméno-zvíře/ }).click();
  for (const p of PLAYERS) await tv.getByRole('button', { name: `${p.name} hraje` }).click();
  await tv.getByRole('group', { name: 'Počet kol' }).getByRole('button', { name: '1', exact: true }).click();
  await tv.getByRole('button', { name: 'Založit místnost' }).click();
  await expect(tv).toHaveURL(/\/tv\/[A-Z0-9]{4}$/);
  const tvMain = tv.getByTestId('tv-mjz');
  await expect(tvMain).toHaveAttribute('data-phase', 'setup');
  const code = (await tv.getByTestId('room-code').innerText()).trim();

  const phones: Record<string, Page> = {};
  const contexts: BrowserContext[] = [];
  for (const p of PLAYERS) {
    const ph = await phone(browser);
    contexts.push(ph.context);
    phones[p.name] = ph.page;
    await ph.page.goto(`${baseURL}/m/${code}`);
    await ph.page.getByRole('button', { name: `Jsem ${p.name}` }).click();
    await expect(ph.page.getByTestId('waiting')).toBeVisible();
    await expect(tv.locator(`[data-testid="lobby-contestant"][data-contestant="${cid(p.name)}"]`)).toHaveAttribute('data-online', 'yes');
  }

  // ---- letter, then writing ----
  await tv.getByRole('button', { name: 'Začít hru' }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'letter');
  const letter = (await tv.getByTestId('mjz-letter').innerText()).trim();
  expect(letter).toMatch(/^[A-Z]$/);
  await tv.getByRole('button', { name: /Začít psát/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'writing');

  const w = (rest: string) => `${letter}${rest}`;
  const sheets: Record<string, Partial<Record<string, string>>> = {
    Táta: Object.fromEntries(CATEGORIES.map((c, i) => [c, w(`tata${i}`)])),
    Máma: { Město: w('mama'), Jméno: w('ena'), Zvíře: w('zver') },
    Anička: { Město: w('mama'), Jméno: w('ena') },
  };
  for (const [name, sheet] of Object.entries(sheets)) {
    const page = phones[name];
    await expect(page.getByTestId('mjz-sheet')).toBeVisible();
    for (const [label, value] of Object.entries(sheet)) await page.getByLabel(label, { exact: true }).fill(value!);
  }
  // Stop! needs a full sheet: Máma cannot press it yet.
  await expect(phones['Máma'].getByRole('button', { name: /Stop!/ })).toBeDisabled();
  await expect(tv.locator(`[data-testid="mjz-progress"][data-contestant="${cid('Táta')}"]`)).toContainText('6 z 6');

  await phones['Táta'].getByRole('button', { name: /Stop!/ }).click();
  await expect(tv.getByTestId('stopped')).toContainText('Táta');
  await expect(phones['Máma'].getByTestId('stopped')).toBeVisible();
  await phones['Máma'].getByRole('button', { name: /Hotovo/ }).click();
  await phones['Anička'].getByRole('button', { name: /Hotovo/ }).click();

  // ---- review: Máma challenges Táta's town, Anička votes it down ----
  await expect(tvMain).toHaveAttribute('data-phase', 'review');
  const tataTown = tv.locator(`[data-testid="mjz-answer"][data-contestant="${cid('Táta')}"][data-category="mesto"]`);
  await expect(tataTown).toHaveAttribute('data-verdict', 'valid');
  await expect(tataTown).toContainText(w('tata0'));
  await phones['Máma'].getByRole('button', { name: 'Napadnout: Táta' }).click();
  await expect(tataTown.getByTestId('votes')).toContainText('Máma');
  await phones['Anička'].getByRole('group', { name: 'Hlas: Táta' }).getByRole('button', { name: /Neplatí/ }).click();
  await expect(tataTown).toHaveAttribute('data-verdict', 'invalid');
  // Táta cannot vote on his own answer; his phone shows the verdict.
  await expect(phones['Táta'].getByRole('group', { name: 'Hlas: Táta' })).toHaveCount(0);
  await expect(phones['Táta'].locator(`[data-testid="mjz-answer"][data-contestant="${cid('Táta')}"]`)).toHaveAttribute('data-verdict', 'invalid');

  // The host has the last word: Máma's and Anička's shared town stands, then the next category.
  await tv.getByRole('button', { name: 'Uznat odpověď Máma', exact: true }).click();
  await tv.getByRole('button', { name: /Další kategorie/ }).click();
  await expect(phones['Máma'].getByRole('heading', { name: /Jméno na/ })).toBeVisible();

  await tv.getByRole('button', { name: /Spočítat kolo/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'roundEnd');
  await expect(tv.getByTestId('standings')).toBeVisible();
  await tv.getByRole('button', { name: /Konečné pořadí/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'finished');
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
    .toBe('mjz/finished');
  const seats = await db.query<{ player_id: string; place: number; score: string }>(
    `SELECT mp.player_id, mp.place, mp.score FROM match_participants mp JOIN matches m ON m.id = mp.match_id
      WHERE m.household_id = $1 AND m.room_code = $2`,
    [householdId, code],
  );
  expect(seats.rows.map((r) => Number(r.player_id)).sort()).toEqual(Object.values(ids).sort());
  // Táta: town struck, five other categories alone or unique → still first.
  const tata = seats.rows.find((r) => Number(r.player_id) === ids['Táta'])!;
  expect(tata.place).toBe(1);

  for (const c of contexts) await c.close();
  await tvContext.close();
});
