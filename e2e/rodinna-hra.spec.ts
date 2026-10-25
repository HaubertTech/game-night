import { expect, test, type Page } from '@playwright/test';
import type { Question } from '../src/lib/types.ts';
import hospodaPriroda from '../tests/fixtures/questions/hospoda/priroda.json' with { type: 'json' };
import hospodaDejiny from '../tests/fixtures/questions/hospoda/dejiny.json' with { type: 'json' };
import lavicePriroda from '../tests/fixtures/questions/lavice/priroda.json' with { type: 'json' };
import laviceDejiny from '../tests/fixtures/questions/lavice/dejiny.json' with { type: 'json' };

const byText = new Map<string, Question>(
  ([...hospodaPriroda, ...hospodaDejiny, ...lavicePriroda, ...laviceDejiny] as Question[]).map((q) => [q.text, q]),
);

async function addPlayer(page: Page, name: string, level: 'Hospoda' | 'Lavice' | 'Pískoviště') {
  await page.getByLabel('Jméno').fill(name);
  await page.getByRole('group', { name: 'Úroveň', exact: true }).getByRole('button', { name: level }).click();
  await page.getByRole('button', { name: 'Přidat hráče' }).click();
  await expect(page.getByRole('button', { name: `${name} hraje` })).toHaveAttribute('aria-pressed', 'true');
}

async function phase(page: Page): Promise<string> {
  return (await page.getByTestId('game').getAttribute('data-phase')) ?? '';
}

/** Answers the visible question: correctly when we know the fixture, otherwise the first option. */
async function answerQuestion(page: Page) {
  const card = page.getByTestId('question');
  const text = (await card.getByRole('heading').first().innerText()).trim();
  const q = byText.get(text);
  const type = await card.getAttribute('data-type');
  if (type === 'estimate') {
    const input = page.getByTestId('estimate-input');
    await expect(input).toHaveAttribute('inputmode', 'numeric');
    await input.fill(String(q?.type === 'estimate' ? q.answer : 1));
    await page.getByRole('button', { name: 'Odpovědět' }).click();
  } else if (type === 'open') {
    await page.getByRole('button', { name: 'Ukázat odpověď' }).click();
    await page.getByRole('button', { name: 'Ano, správně' }).click();
  } else if (q?.type === 'choice') {
    await card.getByTestId('option').filter({ hasText: new RegExp(`^${q.answer}$`) }).click();
  } else {
    await card.getByTestId('option').first().click();
  }
}

test('rodinná hra: tři úrovně, dvě kola, žolík a konečné pořadí', async ({ page }) => {
  await page.goto('/tablet');
  await expect(page.getByRole('heading', { name: 'Kvízovna' })).toBeVisible();

  await addPlayer(page, 'Táta', 'Hospoda');
  await addPlayer(page, 'Anička', 'Lavice');
  await addPlayer(page, 'Kuba', 'Pískoviště');

  await page.getByRole('button', { name: 'Příroda a zvířata' }).click();
  await page.getByRole('button', { name: 'Dějiny a vynálezy' }).click();
  await expect(page.getByText('Mix Pískoviště')).toBeVisible();
  await page.getByRole('group', { name: 'Otázek na hráče v kole' }).getByRole('button', { name: '2', exact: true }).click();
  await page.getByRole('button', { name: 'Začít hru' }).click();

  await expect(page).toHaveURL(/\/tablet\/hra$/);
  await expect(page.getByTestId('round-intro')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Příroda a zvířata' })).toBeVisible();
  await page.getByRole('button', { name: 'Žolík Táta' }).click();
  await expect(page.getByRole('button', { name: 'Žolík Táta' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Začít kolo' }).click();

  const handedTo: string[] = [];
  let reloaded = false;
  let roundEnds = 0;
  for (let guard = 0; guard < 80; guard++) {
    const p = await phase(page);
    if (p === 'finished') break;
    if (p === 'handover') {
      const handover = page.getByTestId('handover');
      await expect(handover.getByText('Na řadě je', { exact: true })).toBeVisible();
      handedTo.push((await handover.locator('.name').innerText()).trim());
      await page.getByRole('button', { name: 'Jsem tu, ukaž otázku' }).click();
    } else if (p === 'question') {
      await answerQuestion(page);
    } else if (p === 'feedback') {
      await expect(page.getByText('Správná odpověď')).toBeVisible();
      if (!reloaded && handedTo.length === 3) {
        // The game must survive a reload in the middle.
        reloaded = true;
        await page.reload();
        await expect(page.getByTestId('feedback')).toBeVisible();
      }
      await page.getByRole('button', { name: /Další hráč|Konec kola/ }).click();
    } else if (p === 'roundEnd') {
      roundEnds++;
      await expect(page.getByRole('heading', { name: 'Průběžné pořadí' })).toBeVisible();
      await expect(page.getByTestId('standings').locator('li')).toHaveCount(3);
      await page.getByRole('button', { name: /Další kolo|Výsledky/ }).click();
    } else if (p === 'roundIntro') {
      await expect(page.getByRole('heading', { name: 'Dějiny a vynálezy' })).toBeVisible();
      // Táta already used the joker in round 1.
      await expect(page.getByRole('button', { name: 'Žolík Táta' })).toBeDisabled();
      await page.getByRole('button', { name: 'Začít kolo' }).click();
    }
    // Every action above moves the game to another phase; wait for it before reading the next one.
    await expect.poll(() => phase(page)).not.toBe(p);
  }

  expect(reloaded).toBe(true);
  expect(roundEnds).toBe(2);
  // 3 players × 2 questions × 2 rounds, rotating; round 2 starts with Anička.
  expect(handedTo).toEqual([
    'Táta', 'Anička', 'Kuba', 'Táta', 'Anička', 'Kuba',
    'Anička', 'Kuba', 'Táta', 'Anička', 'Kuba', 'Táta',
  ]);

  const final = page.getByTestId('final');
  await expect(final.getByRole('heading', { name: 'Konečné pořadí' })).toBeVisible();
  const rows = final.getByTestId('standings').locator('li');
  await expect(rows).toHaveCount(3);
  // Táta answers everything right and doubles round 1 with the joker → clear winner.
  await expect(rows.first()).toContainText('Táta');
  await expect(rows.first()).toContainText('🥇');
  await expect(final.getByText('Nej odpověď')).toBeVisible();
  await expect(final.getByText('Úspěšnost po tématech')).toBeVisible();

  await page.getByRole('button', { name: 'Nová hra' }).click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect(page.getByText('Celkem 1 hra.')).toBeVisible();
  // Profiles are remembered.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Kuba hraje' })).toBeVisible();
});
