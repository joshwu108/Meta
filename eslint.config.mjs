import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['node_modules/**', '.next/**', 'coverage/**', 'tests/stubs/**', 'next-env.d.ts'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        // `const { [key]: _removed, ...rest } = obj` is how this codebase omits a key
        // without mutating the original.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Immutability (specs/README.md section 1): no in-place mutation of inputs.
      'no-param-reassign': ['error', { props: true }],
      eqeqeq: ['error', 'smart'],
    },
  },
];

export default config;
