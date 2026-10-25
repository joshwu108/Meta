import { defineConfig } from 'vitest/config';
import path from 'node:path';

const alias = { '@': path.resolve(__dirname, 'src') };
/** `server-only` throws outside a React Server environment; every project stubs it. */
const serverAlias = { ...alias, 'server-only': path.resolve(__dirname, 'tests/support/server-only.ts') };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias: serverAlias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
          environment: 'node',
          env: { MOCK_AI: '1' },
        },
      },
      {
        resolve: { alias: serverAlias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // SEED_SCALE=0 for the same reason the Playwright suite sets it: these tests assert on
          // the hand-written demo fixtures, and several resolve users with a single
          // `listUsers({ perPage: 200 })`, which silently truncates once the generated cohort
          // pushes the population past that. A test that wants the cohort asks for it itself.
          env: { MOCK_AI: '1', SEED_SCALE: '0' },
          setupFiles: ['tests/integration/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          sequence: { concurrent: false },
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
      {
        resolve: { alias: serverAlias },
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/db/support/setup.ts'],
          globalSetup: ['tests/db/support/global-setup.ts'],
          // 06 asks 02 for explanations and follow-ups, so this project reaches the model client.
          env: {
            MOCK_AI: '1',
            TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
          },
          testTimeout: 30_000,
          hookTimeout: 60_000,
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/features/*/server/**', 'src/lib/**'],
      exclude: ['src/lib/supabase/database.types.ts', 'src/lib/ai/fixtures/**'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
