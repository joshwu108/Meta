import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

/**
 * Vitest does not read `.env` files the way Next does, so the integration suite would skip
 * itself even with a local stack running. `supabase start` prints the three values it
 * needs; put them in `.env.local` (gitignored) and `pnpm test` picks them up.
 * Done by hand rather than with Vite's `loadEnv`, which is ESM-only and cannot be imported
 * from a config file loaded through `require`.
 */
function localEnv(file = '.env.local'): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(new URL(file, import.meta.url), 'utf8');
  } catch {
    return {};
  }

  return contents.split('\n').reduce<Record<string, string>>((acc, rawLine) => {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) return acc;
    const separator = line.indexOf('=');
    if (separator < 1) return acc;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    return { ...acc, [key]: value };
  }, {});
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    env: localEnv(),
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
