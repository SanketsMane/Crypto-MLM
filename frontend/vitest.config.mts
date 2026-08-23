import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Component tests.
 *
 * Scoped deliberately to the logic that decides what a number *says* — error
 * translation, money formatting, the idempotency key's lifecycle, the pieces
 * that turn an API failure into a sentence. That is where a frontend bug on a
 * money platform becomes a financial misstatement rather than a cosmetic one.
 *
 * Whole-journey coverage lives in Playwright (`e2e/`), against the real API.
 * Mocking the backend to assert on a mock would prove nothing about either.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // Playwright specs are run by Playwright, not here.
    exclude: ['e2e/**', 'node_modules/**'],
    restoreMocks: true,
  },
});
