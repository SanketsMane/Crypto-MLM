import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end, against the real stack.
 *
 * No mocked API. The point of these is to prove that a member can get money
 * into the platform, buy something with it, and take it out again — and a mock
 * cannot fail in the ways that matter: a changed field name, a permission that
 * was never granted, an idempotency header the client forgot to send.
 *
 * Both servers must already be running, and the API needs rate-limit headroom:
 *
 *   cd backend  && RATE_LIMIT_PER_MINUTE=5000 npm run dev   # :4000
 *   cd frontend && npm run dev                              # :3010
 *
 * Without that, the suite trips the 120/minute limiter partway through and the
 * failures look like missing elements rather than what they are. The limiter
 * itself is correct — a browser driving twenty journeys in ninety seconds is
 * not a member, and the production default should stay where it is.
 *
 * The specs create their own members, so nothing here depends on data that
 * happens to be lying around. Every account uses an `@example.invalid` address
 * — a reserved TLD that cannot belong to a real person — so the rows they leave
 * are unambiguous.
 *
 * They write to whichever database the API is pointed at. Set `E2E_API_URL` to
 * a stack running against a disposable database if you would rather they did
 * not touch your development data.
 */
export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  // Money flows share one database. Running them at once would have two specs
  // fighting over the same member's balance.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3010',
    // Kept only for a failure: a passing run does not need the artefacts, and
    // a video of every green test is how a CI bucket fills up.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
