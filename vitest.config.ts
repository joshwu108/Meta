import { defineConfig } from 'vitest/config';
import path from 'node:path';

const alias = { '@': path.resolve(__dirname, 'src') };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
          environment: 'node',
          env: { MOCK_AI: '1' },
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/integration/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          sequence: { concurrent: false },
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
      {
        resolve: { alias: { ...alias, 'server-only': path.resolve(__dirname, 'tests/support/server-only.ts') } },
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/db/support/setup.ts'],
          globalSetup: ['tests/db/support/global-setup.ts'],
          env: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' },
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
