import { defineConfig, devices } from "@playwright/test";

// Interim config until 01 ships the shared one. Needs the local Supabase stack seeded (pnpm db:reset && pnpm db:seed).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: true, env: { MOCK_AI: "1", DEMO_MODE: "1" } },
});
