import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetData, seedPlan, makeUser, balanceOf } from './helpers.js';
import { post, postEntry, transferBetweenWallets } from '../src/core/ledger.js';
import { money } from '../src/core/money.js';

beforeAll(seedPlan);
beforeEach(resetData);

describe('ledger — atomicity', () => {
  it('lands every credit under concurrent load', async () => {
    const u = await makeUser();
    const WORKERS = 8, EACH = 25;

    await Promise.all(
      Array.from({ length: WORKERS }, (_, w) =>
        (async () => {
          for (let i = 0; i < EACH; i++) {
            await post({
              userId: u.id, walletType: 'MAIN', direction: 'CREDIT', category: 'ADJUSTMENT',
              amount: money(1), reference: `T-${u.id}-${w}-${i}`, description: 'concurrency probe',
            });
          }
        })(),
      ),
    );

    expect(await balanceOf(u.id)).toBe(WORKERS * EACH);
    expect(await prisma.ledgerEntry.count({ where: { userId: u.id } })).toBe(WORKERS * EACH);
  });

  it('never lets concurrent debits overdraw', async () => {
    const u = await makeUser();
    await post({ userId: u.id, walletType: 'MAIN', direction: 'CREDIT', category: 'DEPOSIT',
                 amount: money(100), reference: `SEED-${u.id}` });

    // ten simultaneous attempts to take 20 from a balance of 100 — five must fail
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        post({ userId: u.id, walletType: 'MAIN', direction: 'DEBIT', category: 'WITHDRAWAL',
               amount: money(20), reference: `D-${u.id}-${i}` }),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(5);
    expect(await balanceOf(u.id)).toBe(0);
  });

  it('rejects a replayed reference instead of paying twice', async () => {
    const u = await makeUser();
    const ref = `REPLAY-${u.id}`;
    await post({ userId: u.id, walletType: 'MAIN', direction: 'CREDIT', category: 'ADJUSTMENT',
                 amount: money(50), reference: ref });

    await expect(
      post({ userId: u.id, walletType: 'MAIN', direction: 'CREDIT', category: 'ADJUSTMENT',
             amount: money(50), reference: ref }),
    ).rejects.toThrow();

    expect(await balanceOf(u.id)).toBe(50);
  });

  it('records the balance each entry produced', async () => {
    const u = await makeUser();
    for (const [i, amt] of [10, 25, 5].entries()) {
      await post({ userId: u.id, walletType: 'MAIN', direction: 'CREDIT', category: 'ADJUSTMENT',
                   amount: money(amt), reference: `SEQ-${u.id}-${i}` });
    }
    const entries = await prisma.ledgerEntry.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
    expect(entries.map((e) => Number(e.balanceAfter))).toEqual([10, 35, 40]);
  });

  it('rolls the whole transfer back if either leg fails', async () => {
    const u = await makeUser();
    await post({ userId: u.id, walletType: 'FUND', direction: 'CREDIT', category: 'DEPOSIT',
                 amount: money(30), reference: `TF-${u.id}` });

    await expect(
      transferBetweenWallets({ userId: u.id, from: 'FUND', to: 'MAIN', amount: money(100), reference: `X-${u.id}` }),
    ).rejects.toThrow();

    expect(await balanceOf(u.id, 'FUND')).toBe(30);
    expect(await balanceOf(u.id, 'MAIN')).toBe(0);
  });

  it('refuses a zero or negative amount', async () => {
    const u = await makeUser();
    for (const bad of [0, -5]) {
      await expect(
        post({ userId: u.id, walletType: 'MAIN', direction: 'CREDIT', category: 'ADJUSTMENT',
               amount: money(bad), reference: `BAD-${u.id}-${bad}` }),
      ).rejects.toThrow();
    }
  });
});

describe('ledger — precision', () => {
  it('does not drift over many fractional credits', async () => {
    const u = await makeUser();
    for (let i = 0; i < 300; i++) {
      await postEntry(prisma, {
        userId: u.id, walletType: 'MAIN', direction: 'CREDIT', category: 'DAILY_ROI',
        amount: money('0.07'), reference: `P-${u.id}-${i}`,
      });
    }
    // 300 x 0.07 is exactly 21 in decimal; floating point would land at 20.999...
    expect(await balanceOf(u.id)).toBe(21);
  });
});
