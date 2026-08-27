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
  // Next dev compiles each route on-demand on first request; several
  // workers hitting a not-yet-compiled route at once (e.g. /history)
  // occasionally races into a slow recompile ("Fast Refresh had to perform
  // a full reload") that blows a test's timeout without any app bug
  // involved. One local retry absorbs that without masking a real,
  // consistently-reproducing failure — retries never save a genuine logic
  // bug, only a transient compile stall.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? undefined : 2,
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
