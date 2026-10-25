// Public sign-up end to end: registration → verification link from the ConsoleMailer outbox →
// logout → login with e-mail and password → first player.

import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { E2E_OUTBOX_DIR } from './helpers/account.ts';

const email = `e2e-reg-${randomBytes(4).toString('hex')}@example.test`;
const password = 'moje-dlouhe-heslo-7';
const householdName = `E2E registrace ${randomBytes(3).toString('hex')}`;

function testDbUrl(): string {
  try {
    process.loadEnvFile('.env');
  } catch {
    // variables may come from the environment
  }
  const url = process.env.DATABASE_URL_TEST ?? '';
  if (!url.includes('_test')) throw new Error('[e2e] DATABASE_URL_TEST with _test in the name is required');
  return url;
}

test.afterAll(async () => {
  const db = new pg.Client({ connectionString: testDbUrl() });
  await db.connect();
  try {
    await db.query('DELETE FROM households WHERE id IN (SELECT household_id FROM accounts WHERE email = $1)', [email]);
  } finally {
    await db.end();
  }
});

/** The newest outbox message for the address, polled (the mail is written after the response). */
async function verificationLink(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    if (existsSync(E2E_OUTBOX_DIR)) {
      for (const file of readdirSync(E2E_OUTBOX_DIR).sort().reverse()) {
        const mail = JSON.parse(readFileSync(join(E2E_OUTBOX_DIR, file), 'utf8')) as { to: string; links: string[] };
        const link = mail.to === email ? mail.links.find((l) => l.includes('/ucet/overeni?token=')) : undefined;
        if (link) return link;
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('verification e-mail not found in the outbox');
}

test('registrace → ověření e-mailu → přihlášení → první hráč', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Založit domácnost' }).click();
  const form = page.getByTestId('register');
  await form.getByLabel('Název domácnosti').fill(householdName);
  await form.getByLabel('E-mail').fill(email);
  await form.getByLabel('Heslo (aspoň 10 znaků)').fill(password);
  await form.getByLabel('Heslo znovu').fill(password);
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Založit domácnost' }).click();

  await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible();
  await expect(page.getByTestId('verify-banner')).toContainText(email);

  const link = new URL(await verificationLink());
  await page.goto(link.pathname + link.search);
  await expect(page.getByTestId('verify')).toContainText('je ověřený');
  await page.getByRole('link', { name: 'Pokračovat' }).click();
  await expect(page.getByTestId('verify-banner')).toHaveCount(0);

  await page.getByRole('button', { name: /Odhlásit/ }).click();
  const login = page.getByTestId('login');
  await expect(login).toBeVisible();
  // The device now remembers the household for the PIN login.
  await expect(page.getByTestId('pin-login')).toContainText(householdName);
  await login.getByLabel('E-mail').fill(email);
  await login.getByLabel('Heslo').fill(password);
  await login.getByRole('button', { name: 'Přihlásit', exact: true }).click();
  await expect(page.getByRole('button', { name: /Nový večer/ })).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: /Hráči/ }).click();
  await expect(page.getByTestId('child-name-hint')).toContainText('přezdívka');
  await page.getByLabel('Jméno').fill('Kuba');
  await page.getByRole('group', { name: 'Úroveň', exact: true }).getByRole('button', { name: 'Lavice' }).click();
  await page.getByRole('button', { name: /Přidat hráče/ }).click();
  await expect(page.getByTestId('players').getByText('Kuba', { exact: true })).toBeVisible();
});
