import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { prisma, resetData, seedPlan, makeUser, balanceOf } from './helpers.js';
import { invalidateConfig } from '../src/core/runtime-config.js';
import * as users from '../src/modules/admin/users/users.service.js';
import * as approval from '../src/modules/admin/users/adjustment-approval.service.js';

/**
 * A manual adjustment is the only operation here that creates value rather than
 * moving it — no counterparty, no deposit behind it, nothing to reconcile it
 * against. It is therefore the most valuable thing one stolen operator session
 * can reach, made worse because the role that can post an adjustment is the
 * same one that can approve a withdrawal.
 *
 * These tests exist to prove the control is real rather than decorative: that
 * large money does not move on one operator's say-so, and that the operator who
 * raised a request cannot wave it through themselves.
 */

/** Matches how the other suites make an operator: a real row, no shared helper. */
let adminSeq = 0;
const makeAdmin = async () => {
  adminSeq += 1;
  const role = await prisma.adminRole.findFirstOrThrow({ where: { slug: 'super-admin' } });
  return prisma.adminUser.create({
    data: {
      email: `ops${adminSeq}-${Date.now()}@test.local`,
      passwordHash: 'x',
      name: `Operator ${adminSeq}`,
      roleId: role.id,
    },
  });
};

const apply = (adminId: string, input: approval.AdjustmentInput) =>
  users.adjustBalance(adminId, input, undefined, true);

const setThreshold = async (value: number) => {
  await prisma.setting.upsert({
    where: { key: 'ADJUSTMENT_APPROVAL_ABOVE' },
    create: { key: 'ADJUSTMENT_APPROVAL_ABOVE', value: String(value) },
    update: { value: String(value) },
  });
  invalidateConfig();
};

const adjustment = (userId: string, amount: string) => ({
  userId,
  walletType: 'MAIN' as const,
  direction: 'CREDIT' as const,
  amount,
  reason: 'Goodwill credit for a support case',
});

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  await setThreshold(1_000);
});

describe('below the threshold', () => {
  it('applies immediately, as it always did', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();

    const res = await users.adjustBalance(admin.id, adjustment(u.id, '100'));

    expect(res.pendingApproval).toBe(false);
    expect(await balanceOf(u.id)).toBeCloseTo(100, 6);
    expect(await prisma.balanceAdjustmentRequest.count()).toBe(0);
  });

  it('treats the threshold itself as small enough', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();

    // "above this" must mean above, not at — an off-by-one here would send
    // every routine correction to a queue.
    const res = await users.adjustBalance(admin.id, adjustment(u.id, '1000'));
    expect(res.pendingApproval).toBe(false);
    expect(await balanceOf(u.id)).toBeCloseTo(1000, 6);
  });
});

describe('above the threshold', () => {
  it('moves no money and parks a request', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();

    const res = await users.adjustBalance(admin.id, adjustment(u.id, '500000'));

    expect(res.pendingApproval).toBe(true);
    expect(await balanceOf(u.id)).toBeCloseTo(0, 6);

    const pending = await approval.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('PENDING');
    // Nothing reached the ledger.
    expect(await prisma.ledgerEntry.count({ where: { userId: u.id } })).toBe(0);
  });

  it('refuses to let the operator who raised it approve it', async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const res = await users.adjustBalance(admin.id, adjustment(u.id, '500000'));
    const requestId = (res as { request: { id: string } }).request.id;

    // Without this the control is theatre.
    await expect(approval.approveAdjustment(admin.id, requestId, apply))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(await balanceOf(u.id)).toBeCloseTo(0, 6);
    const after = await prisma.balanceAdjustmentRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(after.status).toBe('PENDING');
  });

  it('pays once a different operator approves', async () => {
    const maker = await makeAdmin();
    const checker = await makeAdmin();
    const u = await makeUser();
    const res = await users.adjustBalance(maker.id, adjustment(u.id, '500000'));
    const requestId = (res as { request: { id: string } }).request.id;

    await approval.approveAdjustment(checker.id, requestId, apply);

    expect(await balanceOf(u.id)).toBeCloseTo(500000, 6);
    const after = await prisma.balanceAdjustmentRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(after.status).toBe('APPROVED');
    expect(after.decidedById).toBe(checker.id);
  });

  it('pays once even when two approvers act at the same instant', async () => {
    const maker = await makeAdmin();
    const a = await makeAdmin();
    const b = await makeAdmin();
    const u = await makeUser();
    const res = await users.adjustBalance(maker.id, adjustment(u.id, '5000'));
    const requestId = (res as { request: { id: string } }).request.id;

    await Promise.allSettled([
      approval.approveAdjustment(a.id, requestId, apply),
      approval.approveAdjustment(b.id, requestId, apply),
    ]);

    expect(await balanceOf(u.id)).toBeCloseTo(5000, 6);
    expect(await prisma.ledgerEntry.count({ where: { userId: u.id, category: 'ADJUSTMENT' } })).toBe(1);
  });

  it('cannot be approved twice', async () => {
    const maker = await makeAdmin();
    const checker = await makeAdmin();
    const u = await makeUser();
    const res = await users.adjustBalance(maker.id, adjustment(u.id, '5000'));
    const requestId = (res as { request: { id: string } }).request.id;

    await approval.approveAdjustment(checker.id, requestId, apply);
    await expect(approval.approveAdjustment(checker.id, requestId, apply)).rejects.toThrow();

    expect(await balanceOf(u.id)).toBeCloseTo(5000, 6);
  });

  it('moves no money when rejected, and needs a reason', async () => {
    const maker = await makeAdmin();
    const checker = await makeAdmin();
    const u = await makeUser();
    const res = await users.adjustBalance(maker.id, adjustment(u.id, '500000'));
    const requestId = (res as { request: { id: string } }).request.id;

    await expect(approval.rejectAdjustment(checker.id, requestId, '  ')).rejects.toThrow();

    await approval.rejectAdjustment(checker.id, requestId, 'No supporting ticket');
    expect(await balanceOf(u.id)).toBeCloseTo(0, 6);

    const after = await prisma.balanceAdjustmentRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(after.status).toBe('REJECTED');
    expect(after.decisionNote).toBe('No supporting ticket');
    await expect(approval.approveAdjustment(checker.id, requestId, apply)).rejects.toThrow();
  });

  it('applies to debits too, not just credits', async () => {
    const maker = await makeAdmin();
    const u = await makeUser();

    const res = await users.adjustBalance(maker.id, {
      ...adjustment(u.id, '500000'), direction: 'DEBIT',
    });
    expect(res.pendingApproval).toBe(true);
  });
});

describe('a threshold of zero', () => {
  it('sends every adjustment for review, however small', async () => {
    await setThreshold(0);
    const admin = await makeAdmin();
    const u = await makeUser();

    const res = await users.adjustBalance(admin.id, adjustment(u.id, '1'));
    expect(res.pendingApproval).toBe(true);
    expect(await balanceOf(u.id)).toBeCloseTo(0, 6);
  });
});

describe('the audit trail', () => {
  it('records the request and the approval as separate acts', async () => {
    const maker = await makeAdmin();
    const checker = await makeAdmin();
    const u = await makeUser();
    const res = await users.adjustBalance(maker.id, adjustment(u.id, '500000'));
    const requestId = (res as { request: { id: string } }).request.id;
    await approval.approveAdjustment(checker.id, requestId, apply);

    const trail = await prisma.auditLog.findMany({
      where: { entityType: 'balance_adjustment_request', entityId: requestId },
      orderBy: { createdAt: 'asc' },
    });

    // Who asked and who allowed it must both be recoverable, and they must be
    // different people.
    expect(trail).toHaveLength(2);
    expect(trail[0].adminId).toBe(maker.id);
    expect(trail[1].adminId).toBe(checker.id);
  });
});
