import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        Response: 'readonly',
        RequestInit: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'warn',
    },
  },
  // Invariant: CLI may not import platform runtime libraries or database drivers (except validate/run.ts)
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@rntme-cli/platform-storage', '@rntme-cli/platform-storage/*'], message: 'CLI must not import platform-storage (Drizzle/pg).' },
          { group: ['@rntme-cli/platform-http', '@rntme-cli/platform-http/*'], message: 'CLI must not import platform-http (Hono).' },
          { group: ['@workos-inc/*'], message: 'CLI must not import WorkOS SDK.' },
          { group: ['drizzle-orm', 'drizzle-orm/*', 'pg', 'pg-pool'], message: 'CLI must not import a database driver.' },
          { group: ['@aws-sdk/*'], message: 'CLI must not import AWS SDK.' },
        ],
      }],
    },
  },
  // Invariant: only validate/run.ts may import @rntme-cli/platform-core
  {
    files: ['src/**/*.ts'],
    ignores: ['src/validate/run.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@rntme-cli/platform-core', '@rntme-cli/platform-core/*'], message: 'Only src/validate/run.ts may import @rntme-cli/platform-core.' },
          { group: ['@rntme-cli/platform-storage', '@rntme-cli/platform-storage/*'], message: 'CLI must not import platform-storage (Drizzle/pg).' },
          { group: ['@rntme-cli/platform-http', '@rntme-cli/platform-http/*'], message: 'CLI must not import platform-http (Hono).' },
          { group: ['@workos-inc/*'], message: 'CLI must not import WorkOS SDK.' },
          { group: ['drizzle-orm', 'drizzle-orm/*', 'pg', 'pg-pool'], message: 'CLI must not import a database driver.' },
          { group: ['@aws-sdk/*'], message: 'CLI must not import AWS SDK.' },
        ],
      }],
    },
  },
];
