import { expect, type APIRequestContext, type Page, request } from '@playwright/test';

/**
 * Shared machinery for the end-to-end specs.
 *
 * The split here is deliberate. **The member's journey goes through the UI** —
 * that is the thing under test, and the failures worth catching (a renamed
 * field, a missing idempotency header, a button that does nothing) only appear
 * when a real browser drives a real form.
 *
 * **The operator's half goes through the API.** Confirming a deposit and
 * approving a KYC submission are preconditions for the member's next step, not
 * the subject of these tests, and clicking through the admin console for each
 * one would triple the runtime while testing the same server endpoints twice.
 * The admin console has its own spec.
 */

/**
 * Absolute, and used absolutely.
 *
 * Playwright resolves a request path against `baseURL` with URL semantics, so
 * a path beginning with `/` replaces the whole path and the `/api/v1` prefix
 * silently disappears — every call 404s. Building full URLs avoids the trap.
 */
export const API = (process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const url = (path: string) => `${API}${path}`;

/** Marks every account these tests create, so they can be found and removed. */
export const E2E_MARKER = 'e2e-suite';

export interface Member {
  email: string;
  password: string;
  firstName: string;
}

/** A fresh member's details. Unique per call, so specs never collide. */
export function newMember(): Member {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return {
    email: `e2e-${stamp}@example.invalid`,
    password: 'Passw0rd!23',
    firstName: 'Test',
  };
}

// ── the operator side ────────────────────────────────────────────────────────

/**
 * An admin API context.
 *
 * Credentials come from the environment so nothing is committed. Without them
 * the money specs cannot set up their preconditions and say so rather than
 * failing on an unrelated assertion twenty lines later.
 */
export async function adminContext(): Promise<APIRequestContext> {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set — the money flows need an ' +
      'operator to confirm a deposit and approve identity verification.',
    );
  }

  const ctx = await request.newContext();
  const res = await ctx.post(url('/admin/login'), { data: { email, password } });
  if (!res.ok()) {
    throw new Error(`admin sign-in failed (${res.status()}): ${await res.text()}`);
  }
  const token = (await res.json()).data.accessToken as string;

  return request.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

const idempotent = () => ({ 'Idempotency-Key': crypto.randomUUID() });

/** Finds a member by email, so the operator half can act on them. */
export async function findMember(admin: APIRequestContext, email: string) {
  const res = await admin.get(url(`/admin/users?search=${encodeURIComponent(email)}&take=5`));
  expect(res.ok(), `member lookup failed: ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const rows = body.data?.rows ?? body.data?.users ?? body.data ?? [];
  const found = (rows as { id: string; email: string }[]).find((u) => u.email === email);
  expect(found, `no member found for ${email}`).toBeTruthy();
  return found!;
}

/**
 * Confirms the member's pending deposit, which is what credits their fund wallet.
 *
 * Matched on email, not on a user id: the admin deposit list returns
 * `userCode` and `email` per row and no `userId` at all, so matching on an id
 * silently found nothing.
 */
export async function confirmDeposit(admin: APIRequestContext, email: string) {
  const list = await admin.get(url('/admin/deposits?status=PENDING&take=100'));
  expect(list.ok(), await list.text()).toBeTruthy();
  const rows = (await list.json()).data?.rows ?? [];
  const mine = (rows as { id: string; email: string }[]).find((d) => d.email === email);
  expect(mine, `no pending deposit for ${email}`).toBeTruthy();

  const res = await admin.post(url(`/admin/deposits/${mine!.id}/confirm`), { headers: idempotent() });
  expect(res.ok(), `deposit confirmation failed: ${await res.text()}`).toBeTruthy();
}

/**
 * Approves the member's identity check, which withdrawals are gated on.
 *
 * The KYC list nests the member under `user`, unlike the deposit list — the
 * two admin endpoints shape their rows differently, which is worth knowing
 * before writing a matcher against either.
 */
export async function approveKyc(admin: APIRequestContext, email: string) {
  const list = await admin.get(url('/admin/kyc?status=PENDING&take=100'));
  expect(list.ok(), await list.text()).toBeTruthy();
  const rows = (await list.json()).data?.rows ?? [];
  const mine = (rows as { id: string; user: { email: string } }[])
    .find((k) => k.user?.email === email);
  expect(mine, `no pending verification for ${email}`).toBeTruthy();

  const res = await admin.post(url(`/admin/kyc/${mine!.id}/approve`), { headers: idempotent() });
  expect(res.ok(), `kyc approval failed: ${await res.text()}`).toBeTruthy();
}

// ── the member side, through the browser ─────────────────────────────────────

/** Registers through the real form and lands on the dashboard. */
export async function register(page: Page, member: Member) {
  await page.goto('/register');

  await page.getByLabel('First name').fill(member.firstName);
  await page.getByLabel('Email address').fill(member.email);
  await page.getByLabel('Password', { exact: true }).fill(member.password);
  await page.getByLabel('Confirm password').fill(member.password);

  // The terms checkbox has no visible label text of its own.
  await page.getByRole('checkbox').first().check();

  await page.getByRole('button', { name: /create account|sign up|register/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

export async function signIn(page: Page, member: Member) {
  await page.goto('/login');
  await page.getByLabel(/email|member id/i).first().fill(member.email);
  await page.getByLabel('Password', { exact: true }).fill(member.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * The invest button on a package card.
 *
 * Exact text rather than a loose regex: the card renders "Invest now" when the
 * fund wallet covers the tier and "Top up to invest" when it does not, and a
 * spec that matches both cannot tell a successful purchase from a refusal it
 * never noticed.
 */
export const investButton = (page: Page, affordable = true) =>
  page.getByRole('button', { name: affordable ? 'Invest now' : 'Top up to invest' }).first();

/**
 * Opens a screen and waits for it to actually be a screen.
 *
 * Deliberately not `networkidle`. Eleven queries in this app poll on an
 * interval — notifications, job status, the deposit queue — so the network is
 * never idle and that wait simply runs until it times out. It also cannot
 * distinguish "still loading" from "loaded, and polling".
 *
 * Waiting for a heading is both faster and more meaningful: it is the point at
 * which a person would say the page had arrived. The generous timeout covers
 * Next compiling the route on first visit in development.
 */
export async function openScreen(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('h1, h2').first().waitFor({ state: 'visible', timeout: 45_000 });
}

/** Reads a wallet balance off the wallet screen. */
export async function walletBalance(page: Page, wallet: 'Main' | 'Fund'): Promise<number> {
  await page.goto('/wallet');
  const row = page.getByText(new RegExp(`^${wallet}`, 'i')).first();
  await expect(row).toBeVisible();

  const text = await page.locator('body').innerText();
  const match = new RegExp(`${wallet}[^$]*\\$([\\d,]+\\.\\d{2})`, 'i').exec(text);
  return match ? Number(match[1]!.replace(/,/g, '')) : 0;
}
