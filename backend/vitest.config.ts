import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // money tests share one database; running files in parallel would let them
    // fight over the same rows. Concurrency INSIDE a test is the point — across
    // files it is just flakiness.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: { provider: 'v8', include: ['src/core/**', 'src/modules/**/*.service.ts'], reporter: ['text-summary'] },
  },
});
