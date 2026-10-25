import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Server tests (tests/server/**) run against DATABASE_URL_TEST; the global setup creates and migrates it.
const env = loadEnv('test', process.cwd(), '');
const testDatabaseUrl = process.env.DATABASE_URL_TEST ?? env.DATABASE_URL_TEST ?? '';
// The global setup runs in this process, not in the workers that receive `test.env`.
if (testDatabaseUrl) process.env.DATABASE_URL_TEST = testDatabaseUrl;

// Engine and script tests are plain TypeScript; they do not need the SvelteKit plugin.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/setup/test-db-global.ts'],
    env: {
      DATABASE_URL: testDatabaseUrl,
      DATABASE_URL_TEST: testDatabaseUrl,
      HOUSEHOLD_COOKIE_SECRET: 'test-secret-for-vitest-only-0123456789',
      // ConsoleMailer must not write into the dev outbox.
      MAIL_OUTBOX_DIR: 'test-results/outbox-vitest',
      PUBLIC_ORIGIN: '',
      TRUST_PROXY: '',
    },
  },
});
