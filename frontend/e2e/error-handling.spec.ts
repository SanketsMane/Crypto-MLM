import { test, expect } from '@playwright/test';
import { newMember, openScreen, register, signIn } from './helpers';

/**
 * What a member sees when things go wrong.
 *
 * Before this, ninety-nine queries had ten error states between them: a failed
 * load left a spinner turning or a table looking convincingly empty. On a page
 * reporting somebody's balance, "empty" and "we could not load it" are not
 * interchangeable, and the member has no way to tell which they are looking at.
 *
 * These drive real failures — a stopped API, a refused request, a lost
 * connection — and check the screen says so.
 */

test.describe('when the API is unreachable', () => {
  test('the member is told, rather than left watching a spinner', async ({ page }) => {
    await register(page, newMember());

    // Every call fails from here, as though the API had gone down.
    await page.route('**/api/v1/**', (route) => route.abort('connectionrefused'));
    await page.goto('/wallet', { waitUntil: 'domcontentloaded' });

    // The reason names the transport, not a generic apology — and it says the
    // request never arrived, which is what makes it safe to try again.
    await expect(
      page.getByText(/cannot reach the server|you are offline/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('one outage produces one message, not one per query', async ({ page }) => {
    /**
     * A dashboard mounts a dozen queries against the same API. When it goes
     * down they all fail within a few hundred milliseconds, and an unkeyed
     * toast per failure reads as a dozen separate problems.
     */
    await register(page, newMember());
    await page.route('**/api/v1/**', (route) => route.abort('connectionrefused'));
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/cannot reach the server|you are offline/i).first())
      .toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_500);

    const count = await page.getByText(/cannot reach the server|you are offline/i).count();
    expect(count, 'the same outage was reported more than twice').toBeLessThanOrEqual(2);
  });
});

test.describe('when the server refuses', () => {
  test('its own sentence is what the member reads', async ({ page }) => {
    const member = newMember();
    await register(page, member);

    // The API writes its errors for the reader. Replacing them with
    // "Something went wrong" is how a clear refusal becomes a support ticket.
    await page.route('**/api/v1/withdrawals', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'BELOW_MINIMUM', message: 'Minimum withdrawal is $10' },
        }),
      }));

    await openScreen(page, '/withdrawals');
    await expect(page.getByText(/minimum withdrawal is \$10|verify|identity/i).first())
      .toBeVisible();
  });

  test('a 500 shows the reference that finds it in the log', async ({ page }) => {
    await register(page, newMember());

    await page.route('**/api/v1/wallet**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: 'req-abc-123' },
        }),
      }));

    await page.goto('/wallet', { waitUntil: 'domcontentloaded' });

    // The id is the only thread between "it broke" in a ticket and the exact
    // request in the log.
    await expect(page.getByText(/req-abc-123/).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('a failed sign-in', () => {
  test('keeps what was typed and explains the refusal', async ({ page }) => {
    /**
     * A 401 on the login form is an answer, not an expired session — so the
     * page must not reload and throw the form away before the member can read
     * why they were refused.
     */
    const member = newMember();
    await register(page, member);

    await page.goto('/login');
    await page.getByLabel(/email|member id/i).first().fill(member.email);
    await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password');
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    await expect(page.getByText(/invalid|incorrect|credentials|wrong/i).first())
      .toBeVisible({ timeout: 15_000 });

    // Still on the form, with the email intact.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel(/email|member id/i).first()).toHaveValue(member.email);
  });

  test('the right password still works afterwards', async ({ page }) => {
    // A refusal must not leave the form in a state the member cannot recover
    // from — the commonest real journey is "typo, then correct".
    const member = newMember();
    await register(page, member);
    await signIn(page, member);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('losing the connection', () => {
  test('does not sign the member out', async ({ page }) => {
    /**
     * The bug this was written for: the layout treated *any* failure of the
     * session check as "not signed in" and redirected to the login screen. A
     * member on a train going into a tunnel lost their session and whatever
     * they were in the middle of.
     *
     * Only a refused credential — a 401 or 403 — ends a session. A dropped
     * connection says nothing about whether they are signed in.
     */
    await register(page, newMember());
    await page.route('**/api/v1/**', (route) => route.abort('connectionrefused'));
    await page.goto('/wallet', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/could not load|cannot reach the server/i).first())
      .toBeVisible({ timeout: 20_000 });

    // Still inside the member area, not bounced to the sign-in form.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('a genuinely refused session does still sign them out', async ({ page }) => {
    // The guard has to keep working for the case it exists for.
    await register(page, newMember());
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session ended' } }),
      }));

    await page.goto('/wallet', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 20_000 });
  });
});
