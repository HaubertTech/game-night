import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

// E2E_PORT / E2E_LIVE_PORT let a second checkout (worktree) run its own servers side by side.
const PORT = Number(process.env.E2E_PORT ?? 5181);
/** Live mode (TV + phones) needs the database: its own dev server against the test DB. */
const LIVE_PORT = Number(process.env.E2E_LIVE_PORT ?? 5182);
// live*.spec.ts (quiz, aktivity, mjz, chess, cards): TV + phones against the test DB.
const LIVE_SPECS = /live.*\.spec\.ts$/;
/** League flows (evenings, cards, profiles) also need the database: they reuse the live server. */
const LIGA_SPECS = /e2e\/liga[^/]*\.spec\.ts$/;

try {
  process.loadEnvFile('.env');
} catch {
  // No .env: DATABASE_URL_TEST must come from the environment.
}
const testDatabaseUrl = process.env.DATABASE_URL_TEST ?? '';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ipad-landscape', testIgnore: [LIVE_SPECS, LIGA_SPECS], use: { ...devices['iPad Pro 11 landscape'], browserName: 'chromium' } },
    { name: 'ipad-portrait', testIgnore: [LIVE_SPECS, LIGA_SPECS], use: { ...devices['iPad Pro 11'], browserName: 'chromium' } },
    // TV and phones are separate browser contexts inside the test (see e2e/live.spec.ts).
    { name: 'liga', testMatch: LIGA_SPECS, use: { ...devices['iPad Pro 11 landscape'], baseURL: `http://localhost:${LIVE_PORT}`, browserName: 'chromium' } },
    { name: 'live', testMatch: LIVE_SPECS, use: { baseURL: `http://localhost:${LIVE_PORT}`, browserName: 'chromium' } },
  ],
  webServer: [
    {
      // Fixtures instead of the real dataset, so the e2e run does not depend on its size or state.
      command: `vite dev --port ${PORT} --strictPort`,
      env: { VITE_QUESTIONS: 'fixtures' },
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `vite dev --port ${LIVE_PORT} --strictPort`,
      env: {
        VITE_QUESTIONS: 'fixtures',
        QUESTIONS_DIR: 'tests/fixtures/questions',
        DATABASE_URL: testDatabaseUrl,
        DATABASE_URL_TEST: testDatabaseUrl,
        // Registration e2e reads the verification link from here (same path as e2e/helpers/account.ts).
        MAIL_OUTBOX_DIR: join(tmpdir(), 'domaci-liga-e2e-outbox'),
        SMTP_URL: '',
        // Computer card players move quickly, so a whole prší game fits in one test.
        CARD_AI_DELAY_MS: '150',
      },
      url: `http://localhost:${LIVE_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
