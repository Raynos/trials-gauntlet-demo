import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'harness/**/*.test.ts', 'api/**/*.test.ts', 'scripts/**/*.test.mjs'],
    // Capture/export snapshots can contain old test sources. Only authored tests
    // belong in the suite; generated evidence must not run against today's code.
    exclude: ['harness/out/**'],
    environment: 'node',
  },
});
