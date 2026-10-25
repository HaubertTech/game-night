// Shared login helper of the e2e specs: a household with a verified manager account straight in
// the test database, logged in through the real e-mail + password endpoint.

import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type APIRequestContext } from '@playwright/test';
import type pg from 'pg';
import { hashPassword, hashPin } from '../../src/lib/server/auth.ts';

export const E2E_PIN = '4321';
export const E2E_PASSWORD = 'e2e-heslo-spravce-42';
/** ConsoleMailer of the e2e dev server writes here (see playwright.config.ts). */
export const E2E_OUTBOX_DIR = join(tmpdir(), 'domaci-liga-e2e-outbox');

export interface TestManager {
  householdId: number;
  householdName: string;
  email: string;
  password: string;
}

export async function createTestManager(db: Pick<pg.Client, 'query'>, label: string): Promise<TestManager> {
  const suffix = randomBytes(4).toString('hex');
  const householdName = `${label} ${suffix}`;
  const res = await db.query<{ id: string }>('INSERT INTO households (name, pin_hash) VALUES ($1, $2) RETURNING id', [householdName, await hashPin(E2E_PIN)]);
  const householdId = Number(res.rows[0].id);
  const email = `e2e-${suffix}@example.test`;
  await db.query(
    `INSERT INTO accounts (household_id, email, password_hash, terms_version, email_verified_at) VALUES ($1, $2, $3, 'e2e', now())`,
    [householdId, email, await hashPassword(E2E_PASSWORD)],
  );
  return { householdId, householdName, email, password: E2E_PASSWORD };
}

export async function loginManager(request: APIRequestContext, manager: Pick<TestManager, 'email' | 'password'>): Promise<void> {
  const res = await request.post('/api/auth/login', { data: { email: manager.email, password: manager.password } });
  expect(res.ok(), await res.text()).toBe(true);
}
