import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['extensions/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['extensions/**/*.ts'],
      exclude: ['extensions/__tests__/**', 'extensions/**/*.test.ts'],
    },
  },
});