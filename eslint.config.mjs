import { FlatCompat } from '@eslint/eslintrc';
import prettier from 'eslint-config-prettier';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  prettier,
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Command-line scripts whose output *is* the product of running them.
    files: ['supabase/seed/**/*.ts', 'scripts/**/*.ts', 'tests/evals/**/*.ts', 'tests/audit/**/*.ts', 'src/lib/log.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts', 'src/lib/supabase/database.types.ts'],
  },
];

export default config;
