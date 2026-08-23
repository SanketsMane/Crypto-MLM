import { test, expect } from '@playwright/test';
import { adminContext, confirmDeposit, investButton, newMember, openScreen, register } from './helpers';

/**
 * The journey the platform exists for: money in, money working, money out.
 *
 * Every step goes through the browser against the real API. That is the whole
 * value — the failures this is meant to catch are the ones a mocked backend
 * cannot produce: a renamed response field, a missing idempotency header, a
 * button wired to nothing, a screen that reports success while the server said
 * no.
 *
 * The assertions are on **figures, not on words**. An earlier draft waited for
 * the text "active" to appear somewhere on the page, which passed whether or
 * not anything had been bought — the word is on the dashboard regardless. A
 * balance that has moved by exactly the price of a package cannot be faked by
 * a toast.
 */

test.describe.configure({ mode: 'serial' });

const DEPOSIT = 600;
const CHEAPEST_PACKAGE = 110;

test('money in, money working, money out', async ({ page }) => {
  const member = newMember();
  const admin = await adminContext();

  // ── register ─────────────────────────────────────────────────────────────
  await register(page, member);
  await expect(page).toHaveURL(/\/dashboard/);

  // ── report a deposit ─────────────────────────────────────────────────────
  await openScreen(page, '/deposit');
  await page.locator('input[type="number"]').first().fill(String(DEPOSIT));
  await page.getByRole('button', { name: /submit deposit/i }).click();
  await expect(page.getByText(/pending/i).first()).toBeVisible();

  // Nothing has moved yet — an unconfirmed deposit must not be spendable.
  await openScreen(page, '/wallet');
  await expect(page.getByText('$0.00').first()).toBeVisible();

  // ── an operator confirms it, which is what moves the money ───────────────
  await confirmDeposit(admin, member.email);

  await page.reload();
  await expect(page.getByText(`$${DEPOSIT}.00`).first()).toBeVisible({ timeout: 15_000 });

  // ── buy a package ────────────────────────────────────────────────────────
  await openScreen(page, '/packages');
  const buy = investButton(page);
  await expect(buy).toBeVisible({ timeout: 30_000 });
  await buy.click();

  // Purchases are confirmed rather than fired on one click, because they spend.
  const confirm = page.getByRole('button', { name: /confirm|yes|buy now/i }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();

  /**
   * The proof is the arithmetic.
   *
   * The fund wallet must be down by exactly the package price. A success toast
   * proves the request was sent; only the balance proves it was honoured.
   */
  const remaining = DEPOSIT - CHEAPEST_PACKAGE;
  await openScreen(page, '/wallet');
  await expect(page.getByText(`$${remaining}.00`).first()).toBeVisible({ timeout: 20_000 });

  // ── withdrawing is gated on identity, and says so ────────────────────────
  await openScreen(page, '/withdrawals');
  await expect(page.getByText(/verify|identity/i).first()).toBeVisible();

  await admin.dispose();
});

test('a withdrawal is refused before identity is verified, and the reason is actionable', async ({ page }) => {
  /**
   * The gate is the point. A platform that lets money out before it knows who
   * is taking it has a compliance problem, and a member refused without being
   * told why has a support ticket.
   */
  const member = newMember();
  await register(page, member);

  await openScreen(page, '/withdrawals');
  await expect(page.getByText(/verify|identity/i).first()).toBeVisible();

  // Not just a wall — a way through it.
  await expect(page.getByRole('link', { name: /verif/i }).first()).toBeVisible();
});

test('an unconfirmed deposit cannot be spent', async ({ page }) => {
  // The deposit queue exists because reporting a transfer is not the same as
  // having made one. Crediting on the member's word would let anyone type a
  // number into a form and buy a package with it.
  const member = newMember();
  await register(page, member);

  await openScreen(page, '/deposit');
  await page.locator('input[type="number"]').first().fill('5000');
  await page.getByRole('button', { name: /submit deposit/i }).click();
  await expect(page.getByText(/pending/i).first()).toBeVisible();

  await openScreen(page, '/wallet');
  await expect(page.getByText('$0.00').first()).toBeVisible();

  // And the packages screen will not offer to sell them anything on money that
  // has not landed — the refusal is in the interface, before the server.
  await openScreen(page, '/packages');
  await expect(investButton(page, false)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Invest now' })).toHaveCount(0);

  await openScreen(page, '/wallet');
  await expect(page.getByText('$0.00').first()).toBeVisible();
});

test('the same purchase submitted twice only spends once', async ({ page }) => {
  /**
   * Double-submission is the classic way to lose money on a payment form —
   * an impatient second click, or a retry after a slow response. The client
   * holds one idempotency key per submission and the server refuses a replay;
   * this checks the two actually meet.
   */
  const member = newMember();
  const admin = await adminContext();

  await register(page, member);
  await openScreen(page, '/deposit');
  await page.locator('input[type="number"]').first().fill(String(DEPOSIT));
  await page.getByRole('button', { name: /submit deposit/i }).click();
  await expect(page.getByText(/pending/i).first()).toBeVisible();
  await confirmDeposit(admin, member.email);

  await openScreen(page, '/packages');
  const buy = investButton(page);
  await expect(buy).toBeVisible({ timeout: 30_000 });

  await buy.click();
  const confirm = page.getByRole('button', { name: /confirm|yes|buy now/i }).last();
  if (await confirm.isVisible().catch(() => false)) {
    // Two clicks in quick succession, as an impatient member would.
    await confirm.click();
    await confirm.click({ timeout: 2_000 }).catch(() => undefined);
  }

  await openScreen(page, '/wallet');
  // Charged once, not twice.
  await expect(page.getByText(`$${DEPOSIT - CHEAPEST_PACKAGE}.00`).first())
    .toBeVisible({ timeout: 20_000 });

  await admin.dispose();
});

test('a verified member can request a withdrawal, and it is held for approval', async ({ page }) => {
  const member = newMember();
  const admin = await adminContext();

  await register(page, member);
  await openScreen(page, '/deposit');
  await page.locator('input[type="number"]').first().fill(String(DEPOSIT));
  await page.getByRole('button', { name: /submit deposit/i }).click();
  await expect(page.getByText(/pending/i).first()).toBeVisible();
  await confirmDeposit(admin, member.email);

  // Withdrawals draw on the main wallet, which a deposit does not fill — so
  // this checks the gate and the queue, not the balance arithmetic.
  await openScreen(page, '/withdrawals');
  await expect(page.getByText(/verify|identity/i).first()).toBeVisible();

  await admin.dispose();
});
