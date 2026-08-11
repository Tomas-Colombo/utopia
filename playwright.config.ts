import { defineConfig, devices } from '@playwright/test'
import { ADMIN, BASE_URL, SERVER_URL } from './e2e/config/env'

/**
 * E2E configuration — Chromium only, on purpose: the suite exercises business
 * flows against a real Supabase project, and running the same flows on three
 * engines would triple the database writes without testing anything new.
 * Cross-browser rendering is not what these specs assert.
 *
 * `baseURL` is a TENANT SUBDOMAIN (`<sub>.localhost:3000`). Tenant resolution
 * lives in `proxy.ts` and reads the Host header, so hitting bare `localhost`
 * would silently exercise the dev-only "no subdomain" degradation path
 * instead of the real one.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',

  // Every spec shares one tenant and one dev server. Serial execution keeps
  // failures reproducible: with parallel workers, a spec that toggles a
  // module or a price rule would change the world under another one.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Default actor. Specs that need a different one (or none) override
        // this with `test.use({ storageState: ... })`.
        storageState: ADMIN.storageState,
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    // The health check runs from Node, which does not resolve `*.localhost`
    // the way Chromium does — so it targets the bare host.
    url: `${SERVER_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
