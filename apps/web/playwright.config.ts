import { defineConfig, devices } from '@playwright/test';

// Web e2e config. See testing.md's tooling table ("Web e2e | Playwright,
// Chromium with fake media devices") and gate:5 / gate:6 / gate:7 / gate:10.
// Specs live under apps/web/e2e/ (vitest.config.ts excludes that directory
// so `pnpm test` never picks up a *.spec.ts file meant for Playwright).
const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
