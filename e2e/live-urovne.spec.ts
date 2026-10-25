// Levels v2 on TV + phones: kocarek plays „na TV“ with a parent (the host confirms imitations
// directly, point questions are tapped on the TV), prvnacek and hospoda answer on phones.
// The answers land in the test database with the new levels.

import process from 'node:process';
import { expect, test, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import type { Question } from '../src/lib/types.ts';
import { createTestManager, loginManager, type TestManager } from './helpers/account.ts';
import hospodaPriroda from '../tests/fixtures/questions/hospoda/priroda.json' with { type: 'json' };
import kocarekPriroda from '../tests/fixtures/questions/kocarek/priroda.json' with { type: 'json' };
import prvnacekPriroda from '../tests/fixtures/questions/prvnacek/priroda.json' with { type: 'json' };

const byText = new Map<string, Question>(
  ([...hospodaPriroda, ...kocarekPriroda, ...prvnacekPriroda] as Question[]).map((q) => [q.text, q]),
);

const PLAYERS = [
  { name: 'Ema', level: 'kocarek', avatar: '🐰' },
  { name: 'Vojta', level: 'prvnacek', avatar: '🦊' },
  { name: 'Táta', level: 'hospoda', avatar: '🐻' },
] as const;

const databaseUrl = process.env.DATABASE_URL_TEST ?? '';
let db: pg.Client;
let householdId: number;
let manager: TestManager;

test.beforeAll(async () => {
  if (!databaseUrl.includes('_test')) throw new Error('DATABASE_URL_TEST must point to a *_test database');
  db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  manager = await createTestManager(db, 'E2E urovne');
  householdId = manager.householdId;
});

test.afterAll(async () => {
  if (householdId) await db.query('DELETE FROM households WHERE id = $1', [householdId]);
  await db?.end();
});

/** Answers the visible question correctly; imitations are confirmed with „Zvládl/a ✓“. */
async function answer(page: Page): Promise<string> {
  const card = page.getByTestId('live-question');
  await expect(card).toBeVisible();
  const text = (await card.getByRole('heading').first().innerText()).trim();
  const q = byText.get(text);
  if (!q) throw new Error(`unknown question: ${text}`);
  if (q.type === 'imitate') {
    await expect(card.getByTestId('model-answer')).toContainText(q.answer);
    await card.getByRole('button', { name: 'Zvládl/a ✓' }).click();
  } else if (q.type === 'choice' || q.type === 'point') {
    const label = q.level === 'hospoda' ? q.answer : q.answer.replace(/^\S+\s+/u, '');
    await card.getByTestId('option').filter({ hasText: label }).first().click();
  } else if (q.type === 'estimate') {
    await card.getByTestId('estimate-input').fill(String(q.answer));
    await card.getByRole('button', { name: 'Odpovědět' }).click();
  } else {
    await card.getByTestId('open-input').fill(q.answer);
    await card.getByRole('button', { name: 'Odpovědět' }).click();
  }
  return q.type;
}

async function phone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  return { context, page: await context.newPage() };
}

test('TV: Kočárek hraje na TV s rodičem, Prvňáček a Hospoda na telefonech', async ({ browser, baseURL }) => {
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

  await tv.goto('/tv');
  for (const p of PLAYERS) await tv.getByRole('button', { name: `${p.name} hraje` }).click();
  await tv.getByRole('button', { name: 'Příroda a zvířata' }).click();
  await tv.getByRole('group', { name: 'Otázek na hráče v kole' }).getByRole('button', { name: '2', exact: true }).click();
  await tv.getByRole('button', { name: 'Bez časovače' }).click();
  await tv.getByRole('button', { name: 'Založit místnost' }).click();
  await expect(tv).toHaveURL(/\/tv\/[A-Z0-9]{4}$/);
  const code = (await tv.getByTestId('room-code').innerText()).trim();

  await tv.getByRole('button', { name: 'Ema hraje na TV' }).click();
  await expect(tv.getByRole('button', { name: 'Ema hraje na TV' })).toHaveAttribute('aria-pressed', 'true');

  const phones: Record<string, { context: BrowserContext; page: Page }> = {};
  for (const name of ['Vojta', 'Táta']) {
    phones[name] = await phone(browser);
    await phones[name].page.goto(`${baseURL}/m/${code}`);
    await phones[name].page.getByRole('button', { name: `Jsem ${name}` }).click();
    await expect(phones[name].page.getByTestId('waiting')).toBeVisible();
  }

  await tv.getByRole('button', { name: 'Začít hru' }).click();
  const tvMain = tv.getByTestId('tv');
  await expect(tv.getByTestId('round-intro')).toBeVisible();
  await tv.getByRole('button', { name: 'Začít kolo' }).click();

  const emaTypes: string[] = [];
  for (let step = 0; step < 2; step++) {
    await expect(tvMain).toHaveAttribute('data-phase', 'asking');
    // Prvnacek gets pictures and a read-aloud button on the phone.
    const vojta = phones['Vojta'].page;
    await expect(vojta.getByTestId('live-question')).toHaveAttribute('data-level', 'prvnacek');
    await expect(vojta.getByRole('button', { name: '🔊 Přečíst' })).toBeVisible();
    await answer(vojta);
    await answer(phones['Táta'].page);

    await expect(tvMain).toHaveAttribute('data-stage', 'tv');
    await expect(tv.getByTestId('tv-turn')).toContainText('Ema');
    const card = tv.getByTestId('live-question');
    await expect(card).toHaveAttribute('data-level', 'kocarek');
    await expect(card.getByTestId('read-to')).toBeVisible();
    emaTypes.push(await answer(tv));

    await expect(tvMain).toHaveAttribute('data-phase', 'reveal');
    await expect(tv.getByTestId('reveal-card')).toHaveCount(3);
    await expect(tv.locator(`[data-testid="reveal-card"][data-contestant="p${ids['Ema']}"]`)).toHaveAttribute('data-state', 'ok');
    // Only adult open answers wait for a verdict; Ema's imitation was confirmed directly.
    await expect(tv.getByRole('button', { name: 'Uznat odpověď: Ema', exact: true })).toHaveCount(0);
    const accept = tv.getByRole('button', { name: /^Uznat odpověď/ });
    for (const label of await accept.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))) {
      await tv.getByRole('button', { name: label, exact: true }).click();
    }
    await tv.getByRole('button', { name: step === 0 ? /Další otázka/ : /Konec kola/ }).click();
  }
  expect(emaTypes.length).toBe(2);
  await expect(tvMain).toHaveAttribute('data-phase', 'roundEnd');
  await tv.getByRole('button', { name: /Konečné pořadí/ }).click();
  await expect(tvMain).toHaveAttribute('data-phase', 'finished');

  await expect
    .poll(async () => {
      const r = await db.query<{ level: string; n: number }>(
        `SELECT q.level, count(*)::int AS n FROM quiz_answers q JOIN matches m ON m.id = q.match_id
          WHERE m.household_id = $1 AND m.room_code = $2 GROUP BY 1 ORDER BY 1`,
        [householdId, code],
      );
      return r.rows.map((x) => `${x.level}:${x.n}`).join(',');
    })
    .toBe('hospoda:2,kocarek:2,prvnacek:2');
  const ema = await db.query<{ score: string }>(
    `SELECT mp.score FROM match_participants mp JOIN matches m ON m.id = mp.match_id
      WHERE m.household_id = $1 AND m.room_code = $2 AND mp.player_id = $3`,
    [householdId, code, ids['Ema']],
  );
  expect(Number(ema.rows[0].score)).toBe(2);

  for (const p of Object.values(phones)) await p.context.close();
  await tvContext.close();
});
