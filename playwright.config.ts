import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration. The demo-scene tests run with `MOCK_AI=1` so no prompt ever reaches
 * Claude (specs/README.md section 5), against the local Supabase stack.
 *
 * `pnpm test:e2e` boots the app itself; set `E2E_BASE_URL` to point at a running one.
 */

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        // Not `/`: workstream 01 owns the root route and it does not exist yet, so probing
        // it would 404 and the readiness wait would time out. This route answers 401
        // without a session, which Playwright accepts as "server is up".
        url: `${baseURL}/api/dev/session`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { MOCK_AI: '1' },
      },
});
