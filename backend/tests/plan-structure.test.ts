import { describe, expect, it, beforeEach } from 'vitest';
import { resetData } from './helpers.js';
import { prisma } from '../src/core/db.js';
import { planLockState, PLAN_STRUCTURES } from '../src/core/plan-structure.js';
import { parseSetting } from '../src/core/runtime-config.js';
import * as settings from '../src/modules/admin/settings/settings.service.js';

/**
 * The plan structure is the one setting the platform cannot take back, so the
 * door it closes is worth a test of its own. The rules being pinned here:
 *
 *   - a lone root member does NOT close it (no downline exists yet)
 *   - the first SPONSORED member does
 *   - simulation accounts never do, or modelling a plan would lock the very
 *     decision the model exists to inform
 *   - the server refuses the write, not just the console
 */

/* `settings.set` writes an audit row, and that row has a real foreign key to
   admin_users — so the test needs a real admin, not a placeholder id.

   Rebuilt per test rather than once: the lock counts sponsored members across
   the whole platform, so these tests need a genuinely empty table, and
   `resetData` clears admin_users along with everything else. */
let adminId = '';

async function freshAdmin() {
  const role = await prisma.adminRole.upsert({
    where: { slug: 'plan-test-role' },
    create: { name: 'Plan Test', slug: 'plan-test-role', description: 'tests', level: 1, isSystem: false },
    update: {},
  });
  const admin = await prisma.adminUser.upsert({
    where: { email: 'plan-test@plantest.dev' },
    create: { email: 'plan-test@plantest.dev', name: 'Plan Test', passwordHash: 'x', roleId: role.id },
    update: { roleId: role.id },
  });
  adminId = admin.id;
}

let n = 0;
const member = (opts: { sponsorId?: string; simulated?: boolean } = {}) => {
  n += 1;
  return prisma.user.create({
    data: {
      userCode: `PLANT${String(n).padStart(5, '0')}`,
      email: opts.simulated ? `plan-${n}@simulation.invalid` : `plan-${n}@plantest.dev`,
      passwordHash: 'x',
      firstName: 'Plan',
      status: 'ACTIVE',
      ...(opts.sponsorId ? { sponsorId: opts.sponsorId } : {}),
    },
  });
};

describe('plan structure lock', () => {
  beforeEach(async () => {
    await resetData();
    await freshAdmin();
  });

  it('stays open while nobody has a sponsor', async () => {
    await member();
    const lock = await planLockState();
    expect(lock.locked).toBe(false);
    expect(lock.sponsoredMembers).toBe(0);
  });

  it('closes on the first member who joins under a sponsor', async () => {
    const root = await member();
    await member({ sponsorId: root.id });

    const lock = await planLockState();
    expect(lock.locked).toBe(true);
    expect(lock.sponsoredMembers).toBe(1);
    expect(lock.lockedAt).toBeInstanceOf(Date);
    expect(lock.reason).toContain('joined under a sponsor');
  });

  it('ignores simulation accounts entirely', async () => {
    const root = await member({ simulated: true });
    await member({ sponsorId: root.id, simulated: true });

    expect((await planLockState()).locked).toBe(false);
  });

  it('refuses the write once locked, not merely disabling the control', async () => {
    const root = await member();
    await member({ sponsorId: root.id });

    await expect(settings.set(adminId, 'PLAN_STRUCTURE', 'BINARY'))
      .rejects.toThrow(/locked/i);
  });

  it('still allows re-saving the value already in force', async () => {
    const root = await member();
    await member({ sponsorId: root.id });

    // A no-op must not be treated as a change, or the console would error on
    // a save that alters nothing.
    await expect(settings.set(adminId, 'PLAN_STRUCTURE', 'UNILEVEL')).resolves.toBeTruthy();
  });
});

describe('plan structure validation', () => {
  it('accepts a known structure, case-insensitively', () => {
    expect(parseSetting('PLAN_STRUCTURE', 'unilevel')).toBe('UNILEVEL');
  });

  it('rejects an unknown structure', () => {
    expect(() => parseSetting('PLAN_STRUCTURE', 'MATRIX')).toThrow(/must be one of/i);
  });

  it('only offers structures the payout engine can actually run', () => {
    /* The guard, not the current answer: whichever structures are marked
       unimplemented must be refused, so a half-built plan can never be
       selected and quietly pay nothing. */
    for (const s of Object.values(PLAN_STRUCTURES)) {
      if (s.implemented) expect(parseSetting('PLAN_STRUCTURE', s.code)).toBe(s.code);
      else expect(() => parseSetting('PLAN_STRUCTURE', s.code)).toThrow(/not available yet/i);
    }
  });

  it('accepts binary now that the engine implements it', () => {
    expect(PLAN_STRUCTURES.BINARY.implemented).toBe(true);
    expect(parseSetting('PLAN_STRUCTURE', 'BINARY')).toBe('BINARY');
  });
});
