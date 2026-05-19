import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,mjs,jsx}'],
    environment: 'node',
    globals: false,
  },
});
