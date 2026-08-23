import { adminContext, API } from './helpers';

/**
 * Reports the members these tests created. It does not delete them.
 *
 * There is no endpoint to delete a member, and that is deliberate: the ledger
 * is append-only, and an account with entries against it cannot be removed
 * without breaking the record. Adding a destructive endpoint so that a test
 * suite could tidy up would be a bad trade — the tests would be neater and the
 * platform would have a way to erase somebody's history.
 *
 * So this prints what was left and the exact statement to remove it. Every
 * account uses `@example.invalid`, a reserved TLD that cannot belong to a real
 * person, so the filter is unambiguous.
 *
 * The better answer is to point the suite at a disposable database — see
 * `E2E_API_URL` in the Playwright config.
 */
export default async function teardown() {
  if (!process.env.E2E_ADMIN_EMAIL) return;

  try {
    const admin = await adminContext();
    const res = await admin.get(`${API}/admin/users?search=example.invalid&take=200`);

    if (!res.ok()) {
      console.warn(`[teardown] could not list test members (${res.status()})`);
      await admin.dispose();
      return;
    }

    const rows = ((await res.json()).data?.rows ?? []) as { email: string }[];
    const mine = rows.filter((u) => u.email.endsWith('@example.invalid'));
    await admin.dispose();

    if (!mine.length) return;

    console.log(
      `\n[teardown] ${mine.length} test member(s) remain in the database.\n` +
      '           They cannot be deleted through the API — the ledger is append-only.\n' +
      '           To clear them:\n\n' +
      "             DELETE FROM users WHERE email LIKE '%@example.invalid';\n",
    );
  } catch (err) {
    console.warn('[teardown] could not check for leftovers:', err instanceof Error ? err.message : err);
  }
}
