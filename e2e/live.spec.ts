// Live mode end to end: one TV (host) and three phones as separate browser contexts,
// a preschooler playing on the TV, two rounds, a joker, a phone dropping out and coming back,
// and the finished match written to the test database.

import process from 'node:process';
import { expect, test, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import type { Question } from '../src/lib/types.ts';
import { createTestManager, loginManager, type TestManager } from './helpers/account.ts';
import hospodaPriroda from '../tests/fixtures/questions/hospoda/priroda.json' with { type: 'json' };
import hospodaDejiny from '../tests/fixtures/questions/hospoda/dejiny.json' with { type: 'json' };
import lavicePriroda from '../tests/fixtures/questions/lavice/priroda.json' with { type: 'json' };
import laviceDejiny from '../tests/fixtures/questions/lavice/dejiny.json' with { type: 'json' };
import piskovistePriroda from '../tests/fixtures/questions/piskoviste/priroda.json' with { type: 'json' };
import piskovisteJidlo from '../tests/fixtures/questions/piskoviste/jidlo.json' with { type: 'json' };

const byText = new Map<string, Question>(
  (
    [...hospodaPriroda, ...hospodaDejiny, ...lavicePriroda, ...laviceDejiny, ...piskovistePriroda, ...piskovisteJidlo] as Question[]
  ).map((q) => [q.text, q]),
);

const PLAYERS = [
  { name: 'Táta', level: 'hospoda', avatar: '🐻' },
  { name: 'Máma', level: 'hospoda', avatar: '🦉' },
  { name: 'Anička', level: 'lavice', avatar: '🦊' },
  { name: 'Kuba', level: 'piskoviste', avatar: '🐸' },
] as const;

const databaseUrl = process.env.DATABASE_URL_TEST ?? '';
let db: pg.Client;
let householdId: number;
let manager: TestManager;

test.beforeAll(async () => {
  if (!databaseUrl.includes('_test')) throw new Error('DATABASE_URL_TEST must point to a *_test database');
  db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  manager = await createTestManager(db, 'E2E live');
  householdId = manager.householdId;
});

test.afterAll(async () => {
  if (householdId) await db.query('DELETE FROM households WHERE id = $1', [householdId]);
  await db?.end();
});

/** Answers the visible question correctly (fixtures are known). */
async function answer(page: Page) {
  const card = page.getByTestId('live-question');
  await expect(card).toBeVisible();
  const text = (await card.getByRole('heading').first().innerText()).trim();
  const q = byText.get(text);
  if (!q) throw new Error(`unknown question: ${text}`);
  if (q.type === 'choice') {
    const label = q.level === 'piskoviste' ? q.answer.replace(/^\S+\s+/u, '') : q.answer;
    await card.getByTestId('option').filter({ hasText: label }).first().click();
  } else if (q.type === 'estimate') {
    await card.getByTestId('estimate-input').fill(String(q.answer));
    await card.getByRole('button', { name: 'Odpovědět' }).click();
  } else {
    await card.getByTestId('open-input').fill(q.answer);
    await card.getByRole('button', { name: 'Odpovědět' }).click();
  }
}

async function phone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return { context, page: await context.newPage() };
}

test('živá hra: TV a tři telefony, dvě kola, žolík, výpadek telefonu a zápis do DB', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);

  // ---- TV: log in, create players, set up the room ----
  const tvContext = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL });
  const tv = await tvContext.newPage();
  await tv.goto('/tv');
  await expect(tv).toHaveURL(/\/$/); // not logged in → start page
  await loginManager(tv.request, manager);
  const ids: Record<string, number> = {};
  for (const p of PLAYERS) {
    const res = await tv.request.post('/api/players', { data: p });
    expect(res.status()).toBe(201);
    ids[p.name] = (await res.json()).player.id;
  }
  const cid = (name: string) => `p${ids[name]}`;

  await tv.goto('/tv');
  for (const p of PLAYERS) await tv.getByRole('button', { name: `${p.name} hraje` }).click();
  await tv.getByRole('button', { name: 'Příroda a zvířata' }).click();
  await tv.getByRole('button', { name: 'Dějiny a vynálezy' }).click();
  await tv.getByRole('group', { name: 'Otázek na hráče v kole' }).getByRole('button', { name: '1', exact: true }).click();
  await tv.getByRole('button', { name: 'Bez časovače' }).click();
  await tv.getByRole('button', { name: 'Založit místnost' }).click();
  await expect(tv).toHaveURL(/\/tv\/[A-Z0-9]{4}$/);
  const code = (await tv.getByTestId('room-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{4}$/);
  await expect(tv.getByTestId('qr').locator('svg')).toBeVisible();

  // Kuba has no phone: he plays on the TV.
  await tv.getByRole('button', { name: 'Kuba hraje na TV' }).click();
  await expect(tv.getByRole('button', { name: 'Kuba hraje na TV' })).toHaveAttribute('aria-pressed', 'true');

  // ---- phones join ----
  const phones: Record<string, { context: BrowserContext; page: Page }> = {};
  for (const name of ['Táta', 'Máma', 'Anička']) {
    phones[name] = await phone(browser);
    const page = phones[name].page;
    await page.goto(`${baseURL}/m/${code}`);
    await expect(page.getByTestId('picker')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jsem Kuba' })).toHaveCount(0);
    await page.getByRole('button', { name: `Jsem ${name}` }).click();
    await expect(page.getByTestId('waiting')).toBeVisible();
    await expect(tv.locator(`[data-testid="lobby-contestant"][data-contestant="${cid(name)}"]`)).toHaveAttribute('data-online', 'yes');
  }
  // A claimed contestant cannot be taken by another phone.
  const intruder = await phone(browser);
  await intruder.page.goto(`${baseURL}/m/${code}`);
  await expect(intruder.page.getByRole('button', { name: 'Jsem Táta' })).toBeDisabled();
  await intruder.context.close();

  await tv.getByRole('button', { name: 'Začít hru' }).click();
  const tvMain = tv.getByTestId('tv');

  for (let round = 0; round < 2; round++) {
    await expect(tv.getByTestId('round-intro')).toBeVisible();
    if (round === 0) {
      // Anička plays her joker from the phone; the TV sees it.
      const joker = phones['Anička'].page.getByTestId('joker');
      await joker.click();
      await expect(joker).toHaveAttribute('aria-pressed', 'true');
      await expect(tv.getByRole('button', { name: 'Žolík Anička' })).toHaveAttribute('aria-pressed', 'true');
    }
    await tv.getByRole('button', { name: 'Začít kolo' }).click();
    await expect(tvMain).toHaveAttribute('data-phase', 'asking');

    const order = ['Táta', 'Máma', 'Anička'];
    for (const name of order) {
      let page = phones[name].page;
      if (round === 0 && name === 'Táta') {
        // The phone drops out mid-question (tab closed) and comes back: same contestant, same question.
        await expect(page.getByTestId('live-question')).toBeVisible();
        await page.close();
        await expect(tv.locator(`[data-testid="answer-status"][data-contestant="${cid(name)}"]`)).toContainText('nepřipojen');
        page = await phones[name].context.newPage();
        phones[name].page = page;
        await page.goto(`${baseURL}/m/${code}`);
        await expect(page.getByTestId('phone')).toHaveAttribute('data-me', cid(name));
      }
      await answer(page);
      await expect(page.getByTestId('sent')).toBeVisible();
      // After the last phone the TV moves on to Kuba's turn.
      if (name !== order.at(-1)) {
        await expect(tv.locator(`[data-testid="answer-status"][data-contestant="${cid(name)}"]`)).toHaveAttribute('data-answered', 'yes');
      }
    }

    // Phones done → Kuba's question on the TV, answered by touch.
    await expect(tvMain).toHaveAttribute('data-stage', 'tv');
    await expect(tv.getByTestId('tv-turn')).toContainText('Kuba');
    await expect(tv.getByTestId('live-question')).toHaveAttribute('data-level', 'piskoviste');
    await answer(tv);

    await expect(tvMain).toHaveAttribute('data-phase', 'reveal');
    await expect(tv.getByTestId('reveal-card')).toHaveCount(4);
    await expect(tv.getByTestId('fact').first()).toBeVisible();
    // Open answers wait for the host's verdict.
    const accept = tv.getByRole('button', { name: /^Uznat odpověď/ });
    const labels = await accept.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    for (const label of labels) {
      const button = tv.getByRole('button', { name: label, exact: true });
      await button.click();
      await expect(button).toHaveCount(0);
    }
    await expect(phones['Anička'].page.getByTestId('reveal-card')).toBeVisible();
    await expect(phones['Anička'].page.getByTestId('fact')).toBeVisible();

    await tv.getByRole('button', { name: /Konec kola/ }).click();
    await expect(tvMain).toHaveAttribute('data-phase', 'roundEnd');
    await expect(phones['Máma'].page.getByTestId('standings')).toBeVisible();
    await tv.getByRole('button', { name: round === 0 ? /Další kolo/ : /Konečné pořadí/ }).click();
  }

  await expect(tvMain).toHaveAttribute('data-phase', 'finished');
  await expect(tv.getByTestId('final')).toBeVisible();
  await expect(phones['Táta'].page.getByTestId('final')).toBeVisible();

  // ---- database: the match is finished and every contestant has a participant row ----
  await expect
    .poll(async () => {
      const r = await db.query<{ status: string }>(
        `SELECT status FROM matches WHERE household_id = $1 AND room_code = $2 AND mode = 'live'`,
        [householdId, code],
      );
      return r.rows[0]?.status;
    })
    .toBe('finished');
  const participants = await db.query<{ player_id: string; place: number; score: string }>(
    `SELECT mp.player_id, mp.place, mp.score FROM match_participants mp JOIN matches m ON m.id = mp.match_id
      WHERE m.household_id = $1 AND m.room_code = $2`,
    [householdId, code],
  );
  expect(participants.rows.map((r) => Number(r.player_id)).sort()).toEqual(Object.values(ids).sort());
  // Everyone answered correctly; Anička's joker doubled her first round.
  const anicka = participants.rows.find((r) => Number(r.player_id) === ids['Anička'])!;
  expect(anicka.place).toBe(1);
  const answers = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM quiz_answers q JOIN matches m ON m.id = q.match_id WHERE m.household_id = $1 AND m.room_code = $2`,
    [householdId, code],
  );
  expect(answers.rows[0].n).toBe(8);

  for (const p of Object.values(phones)) await p.context.close();
  await tvContext.close();
});
