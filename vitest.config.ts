import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Same project layout as ws/01-core (`unit` + `integration`), plus `events-db` for 06's
// plain-Postgres suites. Interim until 01's config lands on main.
const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node", env: { MOCK_AI: "1" } } },
      {
        resolve: { alias },
        test: {
          name: "events-db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/db/support/setup.ts"],
          globalSetup: ["tests/db/support/global-setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/features/*/server/**/*.ts"],
      reporter: ["text-summary", "text"],
    },
  },
});
