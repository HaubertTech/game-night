import { defineConfig, devices } from '@playwright/test';

const PORT = 5181;

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
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'], browserName: 'chromium' } },
    { name: 'ipad-portrait', use: { ...devices['iPad Pro 11'], browserName: 'chromium' } },
  ],
  webServer: {
    // Fixtures instead of the real dataset, so the e2e run does not depend on its size or state.
    command: `vite dev --port ${PORT} --strictPort`,
    env: { VITE_QUESTIONS: 'fixtures' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
