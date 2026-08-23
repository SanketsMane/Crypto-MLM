import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetData, seedPlan, makeUser } from './helpers.js';
import { purchase } from '../src/modules/investment/investment.service.js';

/**
 * The application already prevents every case below. These tests bypass it
 * entirely and go straight to SQL, because the guarantee being checked is that
 * the *database* refuses impossible money — so a migration, a psql session or a
 * future code path that forgets the guard still cannot corrupt the ledger.
 */

const plan = (amount: string) => prisma.packagePlan.findFirstOrThrow({ where: { amount } });
const violates = (name: string) => new RegExp(name);

beforeAll(seedPlan);
beforeEach(resetData);

describe('wallet invariants', () => {
  it('refuses a negative balance written directly in SQL', async () => {
    const u = await makeUser();
    await expect(
      prisma.$executeRaw`UPDATE wallet_accounts SET balance = -1 WHERE "userId" = ${u.id} AND type = 'MAIN'`,
    ).rejects.toThrow(violates('wallet_balance_non_negative'));
  });

  it('refuses locking more than the balance holds', async () => {
    const u = await makeUser();
    await prisma.$executeRaw`UPDATE wallet_accounts SET balance = 100 WHERE "userId" = ${u.id} AND type = 'MAIN'`;
    await expect(
      prisma.$executeRaw`UPDATE wallet_accounts SET locked = 101 WHERE "userId" = ${u.id} AND type = 'MAIN'`,
    ).rejects.toThrow(violates('wallet_locked_within_balance'));
  });

  it('allows a balance of exactly zero', async () => {
    const u = await makeUser();
    await expect(
      prisma.$executeRaw`UPDATE wallet_accounts SET balance = 0 WHERE "userId" = ${u.id} AND type = 'MAIN'`,
    ).resolves.toBeGreaterThan(0);
  });
});

describe('ledger invariants', () => {
  it('refuses a zero or negative entry — direction carries the sign, not the amount', async () => {
    const u = await makeUser();
    const w = await prisma.walletAccount.findFirstOrThrow({ where: { userId: u.id, type: 'MAIN' } });
    for (const amount of [0, -50]) {
      await expect(
        prisma.$executeRaw`
          INSERT INTO ledger_entries (id, "userId", "walletId", direction, category, amount, "balanceAfter", reference, "createdAt")
          VALUES (gen_random_uuid()::text, ${u.id}, ${w.id}, 'CREDIT'::"LedgerDirection", 'ADJUSTMENT'::"LedgerCategory",
                  ${amount}::numeric, 0, ${'T' + amount + Date.now()}, now())`,
      ).rejects.toThrow(violates('ledger_amount_positive'));
    }
  });

  it('refuses an entry claiming a negative running balance', async () => {
    const u = await makeUser();
    const w = await prisma.walletAccount.findFirstOrThrow({ where: { userId: u.id, type: 'MAIN' } });
    await expect(
      prisma.$executeRaw`
        INSERT INTO ledger_entries (id, "userId", "walletId", direction, category, amount, "balanceAfter", reference, "createdAt")
        VALUES (gen_random_uuid()::text, ${u.id}, ${w.id}, 'DEBIT'::"LedgerDirection", 'ADJUSTMENT'::"LedgerCategory",
                10, -10, ${'NEG' + Date.now()}, now())`,
    ).rejects.toThrow(violates('ledger_balance_non_negative'));
  });
});

describe('investment invariants', () => {
  it('refuses earnings beyond the package ceiling', async () => {
    const u = await makeUser({ funded: 1100 });
    await purchase(u.id, (await plan('1100')).id);
    const inv = await prisma.investment.findFirstOrThrow({ where: { userId: u.id } });

    // capLimit is 250% of 1100 = 2750
    await expect(
      prisma.$executeRaw`UPDATE investments SET "totalEarned" = 2751 WHERE id = ${inv.id}`,
    ).rejects.toThrow(violates('investment_within_cap'));

    await expect(
      prisma.$executeRaw`UPDATE investments SET "totalEarned" = 2750 WHERE id = ${inv.id}`,
    ).resolves.toBeGreaterThan(0);   // exactly at the cap is legitimate
  });
});

describe('withdrawal invariants', () => {
  it('refuses a payout whose net does not equal amount minus fee', async () => {
    const u = await makeUser();
    await expect(
      prisma.$executeRaw`
        INSERT INTO withdrawals (id, "userId", amount, fee, "feePercent", "netAmount", "walletAddress", reference, status, "slaDueAt", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${u.id}, 100, 5, 5, 99, '0x1234567890abcdef1234567890abcdef12345678',
                ${'WA' + Date.now()}, 'PENDING'::"TxStatus", now(), now(), now())`,
    ).rejects.toThrow(violates('withdrawal_arithmetic'));
  });

  it('refuses a payout that nets nothing or less', async () => {
    const u = await makeUser();
    await expect(
      prisma.$executeRaw`
        INSERT INTO withdrawals (id, "userId", amount, fee, "feePercent", "netAmount", "walletAddress", reference, status, "slaDueAt", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${u.id}, 100, 100, 100, 0, '0x1234567890abcdef1234567890abcdef12345678',
                ${'WN' + Date.now()}, 'PENDING'::"TxStatus", now(), now(), now())`,
    ).rejects.toThrow(violates('withdrawal_net_positive'));
  });
});

describe('earnings invariants', () => {
  it('refuses paying a commission more than was earned', async () => {
    const u = await makeUser();
    const from = await makeUser();
    await expect(
      prisma.$executeRaw`
        INSERT INTO commissions (id, "userId", "fromUserId", kind, level, percent, "baseAmount", amount, "paidAmount", reference, "createdAt")
        VALUES (gen_random_uuid()::text, ${u.id}, ${from.id}, 'DIRECT'::"CommissionKind", 1, 4, 1100, 44, 45,
                ${'CX' + Date.now()}, now())`,
    ).rejects.toThrow(violates('commission_paid_within_earned'));
  });

  it('refuses paying ROI more than was accrued', async () => {
    const u = await makeUser({ funded: 1100 });
    await purchase(u.id, (await plan('1100')).id);
    const inv = await prisma.investment.findFirstOrThrow({ where: { userId: u.id } });
    await expect(
      prisma.$executeRaw`
        INSERT INTO roi_accruals (id, "investmentId", "userId", "accrualDate", "baseAmount", "ratePercent", amount, "paidAmount", "createdAt")
        VALUES (gen_random_uuid()::text, ${inv.id}, ${u.id}, '2026-08-17', 1100, 0.5, 5.5, 6, now())`,
    ).rejects.toThrow(violates('roi_paid_within_earned'));
  });
});

describe('catalogue invariants', () => {
  it('refuses a package with no price or no ceiling', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO package_plans (id, name, amount, "dailyRoiPercent", "capPercent", "sortOrder", "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, 'Free money', 0, 0.5, 250, 90, true, now(), now())`,
    ).rejects.toThrow(violates('package_amount_positive'));

    await expect(
      prisma.$executeRaw`
        INSERT INTO package_plans (id, name, amount, "dailyRoiPercent", "capPercent", "sortOrder", "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, 'Uncapped', 100, 0.5, 0, 91, true, now(), now())`,
    ).rejects.toThrow(violates('package_cap_positive'));
  });
});

describe('concurrent purchases in one tree', () => {
  /**
   * Team volume propagation updates every ancestor's row in one statement.
   * Postgres locks the matched rows in whatever order the plan produces, so
   * two buyers in overlapping branches could take the same ancestors in
   * opposite orders and deadlock.
   *
   * This is not a theoretical race. A load run of forty concurrent purchases
   * lost thirty-four of them to `40P01` before the ordering was fixed — and a
   * deadlocked purchase is a member charged for a package they did not get.
   */
  it('does not deadlock, and every buyer gets their package', async () => {
    const root = await makeUser();
    const mid = await makeUser({ sponsorId: root.id });

    const pkg = await plan('110');
    const price = Number(pkg.amount);

    // Twenty buyers spread across two branches, so their uplines overlap.
    const buyers = [];
    for (let i = 0; i < 20; i += 1) {
      buyers.push(await makeUser({ sponsorId: i % 2 === 0 ? root.id : mid.id, funded: price }));
    }

    const results = await Promise.allSettled(buyers.map((b) => purchase(b.id, pkg.id)));
    const failed = results.filter((r) => r.status === 'rejected');

    expect(failed.map((f) => String((f as PromiseRejectedResult).reason))).toEqual([]);
    expect(await prisma.investment.count({ where: { userId: { in: buyers.map((b) => b.id) } } })).toBe(20);

    // And the volume that reached the root is every one of those purchases,
    // so no update was silently lost to a retry.
    const rootVolume = await prisma.teamVolume.findUniqueOrThrow({ where: { userId: root.id } });
    expect(Number(rootVolume.totalTeamBusiness)).toBe(20 * price);
  });
});
