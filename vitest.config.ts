import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/features/business/server/**', 'src/features/proposals/server/**'],
      // Type-only and framework-wiring modules: `store.ts` is an interface, and
      // `context.ts` / `page-data.ts` only build the dependency bundle from `next/headers`
      // and the Supabase clients. Both are exercised by the integration and E2E tests.
      exclude: [
        'src/features/business/server/store.ts',
        'src/features/business/server/context.ts',
        'src/features/business/server/page-data.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
  resolve: {
    alias: {
      '@': src,
      // `server-only` throws on import outside an RSC graph; Vitest runs plain Node.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
});
