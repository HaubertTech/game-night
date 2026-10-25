// Levels v2 on one tablet: kocarek (the parent reads, point + imitate confirmed by the parent),
// prvnacek (pictures, read aloud on a tap) and hospoda in one game.

import { expect, test, type Page } from '@playwright/test';
import type { Question } from '../src/lib/types.ts';
import hospodaPriroda from '../tests/fixtures/questions/hospoda/priroda.json' with { type: 'json' };
import hospodaDejiny from '../tests/fixtures/questions/hospoda/dejiny.json' with { type: 'json' };
import kocarekPriroda from '../tests/fixtures/questions/kocarek/priroda.json' with { type: 'json' };
import prvnacekPriroda from '../tests/fixtures/questions/prvnacek/priroda.json' with { type: 'json' };
import prvnacekDejiny from '../tests/fixtures/questions/prvnacek/dejiny.json' with { type: 'json' };

const byText = new Map<string, Question>(
  ([...hospodaPriroda, ...hospodaDejiny, ...kocarekPriroda, ...prvnacekPriroda, ...prvnacekDejiny] as Question[]).map((q) => [q.text, q]),
);

async function addPlayer(page: Page, name: string, level: 'Hospoda' | 'Prvňáček' | 'Kočárek') {
  await page.getByLabel('Jméno').fill(name);
  await page.getByRole('group', { name: 'Úroveň', exact: true }).getByRole('button', { name: level }).click();
  await page.getByRole('button', { name: 'Přidat hráče' }).click();
  await expect(page.getByRole('button', { name: `${name} hraje` })).toHaveAttribute('aria-pressed', 'true');
}

async function phase(page: Page): Promise<string> {
  return (await page.getByTestId('game').getAttribute('data-phase')) ?? '';
}

test('tablet: Kočárek s rodičem, Prvňáček a Hospoda v jedné hře', async ({ page }) => {
  await page.goto('/tablet');
  const levels = page.getByRole('group', { name: 'Úroveň', exact: true }).getByRole('button');
  await expect(levels).toHaveCount(5);
  await expect(levels.first()).toContainText('Kočárek');
  await expect(levels.first()).toContainText('2–3 roky');

  await addPlayer(page, 'Ema', 'Kočárek');
  await addPlayer(page, 'Vojta', 'Prvňáček');
  await addPlayer(page, 'Táta', 'Hospoda');

  await page.getByRole('button', { name: 'Příroda a zvířata' }).click();
  // kocarek has 4 nature questions: 4 per player draws all of them (2× point, 2× imitate).
  await page.getByRole('group', { name: 'Otázek na hráče v kole' }).getByRole('button', { name: '4', exact: true }).click();
  await page.getByRole('button', { name: 'Začít hru' }).click();
  await expect(page).toHaveURL(/\/tablet\/hra$/);
  await page.getByRole('button', { name: 'Začít kolo' }).click();

  const seen: Record<string, string[]> = {};
  let current = '';
  for (let guard = 0; guard < 80; guard++) {
    const p = await phase(page);
    if (p === 'finished') break;
    if (p === 'handover') {
      const handover = page.getByTestId('handover');
      current = (await handover.locator('.name').innerText()).trim();
      if (current === 'Ema') await expect(handover.getByTestId('parent-hint')).toBeVisible();
      await page.getByRole('button', { name: 'Jsem tu, ukaž otázku' }).click();
    } else if (p === 'question') {
      const card = page.getByTestId('question');
      const level = (await card.getAttribute('data-level')) ?? '';
      const type = (await card.getAttribute('data-type')) ?? '';
      (seen[level] ??= []).push(type);
      const text = (await card.getByRole('heading').first().innerText()).trim();
      const q = byText.get(text);
      if (level === 'kocarek') {
        await expect(card.getByTestId('read-to')).toHaveText(/Přečti dítěti/);
        await expect(card.getByTestId('question-image')).toBeVisible();
      } else {
        await expect(card.getByTestId('read-to')).toHaveCount(0);
      }
      if (level === 'prvnacek') await expect(card.getByTestId('option')).toHaveCount(3);
      if (type === 'imitate') {
        await expect(card.getByTestId('model-answer')).toContainText(String(q?.answer ?? ''));
        await card.getByRole('button', { name: 'Zvládl/a ✓' }).click();
      } else if (type === 'estimate') {
        await page.getByTestId('estimate-input').fill(String(q?.type === 'estimate' ? q.answer : 1));
        await page.getByRole('button', { name: 'Odpovědět' }).click();
      } else if (type === 'open') {
        await page.getByRole('button', { name: 'Ukázat odpověď' }).click();
        await page.getByRole('button', { name: 'Ano, správně' }).click();
      } else {
        const answer = q && (q.type === 'choice' || q.type === 'point') ? q.answer : '';
        const label = answer.replace(/^\S+\s+/u, '');
        await card.getByTestId('option').filter({ hasText: label }).first().click();
      }
    } else if (p === 'feedback') {
      await expect(page.getByTestId('feedback')).toBeVisible();
      await page.getByRole('button', { name: /Další hráč|Konec kola/ }).click();
    } else if (p === 'roundEnd') {
      await page.getByRole('button', { name: /Další kolo|Výsledky/ }).click();
    }
    await expect.poll(() => phase(page)).not.toBe(p);
  }

  expect(seen.kocarek?.slice().sort()).toEqual(['imitate', 'imitate', 'point', 'point']);
  expect(seen.prvnacek).toEqual(['choice', 'choice', 'choice', 'choice']);
  expect(seen.hospoda).toHaveLength(4);

  // Everything answered right (the parent confirmed both imitations) → Ema has 4 points.
  const rows = page.getByTestId('final').getByTestId('standings').locator('li');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Ema' })).toContainText('4');
});
