import { defineConfig } from 'vitest/config';

// CAR-153: single test runner. All `*.test.mjs` files under src/ use Vitest
// (`import { test, expect } from 'vitest'`) — `node --test` is no longer
// part of the workflow. The broad include glob picks up new test files
// automatically.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,mjs,jsx}'],
    environment: 'node',
    globals: false,
  },
});
