import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/api/**/*.ts', 'src/node/**/*.ts'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
});
