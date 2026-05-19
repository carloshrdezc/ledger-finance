import { defineConfig } from 'vitest/config';

// Until CAR-153 unifies all tests onto Vitest, the include glob is an
// explicit allowlist of Vitest-style files. Anything not listed here is
// presumed to be node:test style (alerts/charts/period/planning) and is
// run separately via `node --test` if at all.
export default defineConfig({
  test: {
    include: [
      'src/renderer/fx.test.mjs',
    ],
    environment: 'node',
    globals: false,
  },
});
