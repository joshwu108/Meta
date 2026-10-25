import { defineConfig, devices } from '@playwright/test';

// 3100 by default: port 3000 is commonly taken by other local tools (Docker, other dev servers).
const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
// E2E_SERVER=prod serves a production build (`next start`): no first-request compiles and no
// dev-only render errors. CI sets it; locally `pnpm test:e2e:prod` does the same.
const isProdServer = process.env.E2E_SERVER === 'prod';
/**
 * Run the built server rather than `next dev`. CI always does: `next dev` compiles routes on
 * first request and intermittently crashes renders in its dev-only RSC runtime (`frame.join is
 * not a function`), which made the suite flaky with no product fault behind it. `E2E_SERVER=prod`
 * opts into the same path locally.
 */
const useProdServer = Boolean(process.env.CI) || isProdServer;

export default defineConfig({
  testDir: './tests/e2e',
  // Says out loud when a run is the fast-but-not-authoritative kind.
  globalSetup: './tests/e2e/global-setup.ts',
  // Every spec shares one local database and reseeds it, so files must not overlap.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Baselines are per platform: fonts differ between macOS and Linux CI. CI runs with
  // --update-snapshots=missing so a new platform writes its own baselines on first run.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: useProdServer ? `pnpm build && pnpm start -p ${port}` : `pnpm dev -p ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI && !isProdServer,
    // A production build plus start needs far longer than a dev boot.
    timeout: useProdServer ? 420_000 : 120_000,
    // ENABLE_DEV_ROUTES lets 05's suite seed a fixture proposal; the route refuses
    // without it and on any production deployment. IMPORT_ENABLED turns on 07's Scene 1b;
    // SEED_SCALE=0 keeps the suite off the generated cohort so its runtime does not regress.
    env: {
      MOCK_AI: '1',
      DEMO_MODE: '1',
      NEXT_PUBLIC_SITE_URL: baseURL,
      ENABLE_DEV_ROUTES: '1',
      IMPORT_ENABLED: '1',
      SEED_SCALE: '0',
    },
  },
});
