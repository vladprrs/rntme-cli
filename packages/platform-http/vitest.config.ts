import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
    reporters: 'default',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    passWithNoTests: true,
  },
});
