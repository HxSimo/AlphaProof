import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'apps/web/src/**/*.test.tsx',
      'tests/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', 'tests/database/**'],
    testTimeout: 10000,
  },
});
