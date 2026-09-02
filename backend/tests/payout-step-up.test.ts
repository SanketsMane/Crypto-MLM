import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { prisma, resetData, seedPlan, makeUser, PASSWORD, verifyKyc } from './helpers.js';
import { invalidateConfig } from '../src/core/runtime-config.js';
import { request as requestWithdrawal } from '../src/modules/withdrawal/withdrawal.service.js';
import { update as updateProfile } from '../src/modules/customer/customer.service.js';
import { issueStepUp, verifyStepUp } from '../src/modules/auth/step-up.service.js';

/**
 * The chain this closes:
 *
 *   1. somebody holds an unlocked phone, or a stolen refresh token
 *   2. PATCH /customer/profile  → payout address becomes theirs
 *   3. POST  /withdrawal        → the balance follows it out
 *
 * Both steps used to need nothing beyond the access token already on the
 * device. Two independent controls now sit across that path, and the tests
 * below check each one alone and then the pair together — because a control
 * that only works while the other also works is one control, not two.
 */

const ADDR_A = '0x' + 'a'.repeat(40);
const ADDR_B = '0x' + 'b'.repeat(40);

const fundMain = async (userId: string, amount: number) => {
  // Verified outright rather than by turning the KYC requirement off: a global
  // setting is shared state, and a neighbouring test can restore it between
  // this test's setup and its assertion.
  await verifyKyc(userId);
  await prisma.$executeRaw`UPDATE wallet_accounts SET balance = ${amount} WHERE "userId" = ${userId} AND type = 'MAIN'`;
};

const setSetting = async (key: string, value: string | number) => {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) },
  });
  invalidateConfig();
};

/** Moves the recorded change into the past, to age out the hold. */
const ageAddressChange = (userId: string, hours: number) =>
  prisma.user.update({
    where: { id: userId },
    data: { walletAddressChangedAt: new Date(Date.now() - hours * 3_600_000) },
  });

beforeAll(seedPlan);
beforeEach(async () => {
  await resetData();
  await setSetting('WITHDRAWAL_ADDRESS_HOLD_HOURS', 24);
  await setSetting('STEP_UP_TOTP_ABOVE', 1_000);
});

describe('withdrawal requires re-authentication', () => {
  it('refuses a withdrawal that carries no step-up at all', async () => {
    const u = await makeUser();
    await fundMain(u.id, 5_000);

    await expect(requestWithdrawal(u.id, '100', ADDR_A))
      .rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
  });

  it('accepts a password step-up for an amount under the threshold', async () => {
    const u = await makeUser();
    await fundMain(u.id, 5_000);

    const w = await requestWithdrawal(u.id, '100', ADDR_A, undefined, 'password');
    expect(w).toBeTruthy();
  });

  it('demands an authenticator code above the threshold, and says so', async () => {
    const u = await makeUser();
    await fundMain(u.id, 5_000);

    await expect(requestWithdrawal(u.id, '1500', ADDR_A, undefined, 'password'))
      .rejects.toMatchObject({ code: 'STEP_UP_REQUIRED', details: { require: 'totp' } });
  });

  it('accepts an authenticator code above the threshold', async () => {
    const u = await makeUser();
    await fundMain(u.id, 5_000);

    const w = await requestWithdrawal(u.id, '1500', ADDR_A, undefined, 'totp');
    expect(w).toBeTruthy();
  });

  it('treats a zero threshold as "always require a code"', async () => {
    await setSetting('STEP_UP_TOTP_ABOVE', 0);
    const u = await makeUser();
    await fundMain(u.id, 5_000);

    await expect(requestWithdrawal(u.id, '10', ADDR_A, undefined, 'password'))
      .rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
    await expect(requestWithdrawal(u.id, '10', ADDR_A, undefined, 'totp')).resolves.toBeTruthy();
  });
});

describe('changing the payout address requires re-authentication', () => {
  it('refuses an address change with no step-up', async () => {
    const u = await makeUser();
    await expect(updateProfile(u.id, { walletAddress: ADDR_B }))
      .rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.walletAddress).not.toBe(ADDR_B);
  });

  it('allows an ordinary profile edit without one', async () => {
    const u = await makeUser();
    const saved = await updateProfile(u.id, { firstName: 'Renamed' });
    expect(saved.firstName).toBe('Renamed');
  });

  it('stamps the change so the hold has something to measure from', async () => {
    const u = await makeUser();
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.walletAddressChangedAt).toBeNull();

    await updateProfile(u.id, { walletAddress: ADDR_B }, undefined, 'password');

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.walletAddress).toBe(ADDR_B);
    expect(after?.walletAddressChangedAt).toBeInstanceOf(Date);
  });

  it('does not stamp when the address is submitted unchanged', async () => {
    const u = await makeUser();
    await updateProfile(u.id, { walletAddress: ADDR_B }, undefined, 'password');
    await ageAddressChange(u.id, 100);
    const before = await prisma.user.findUnique({ where: { id: u.id } });

    // Re-submitting the same value is not a change, so it must not restart the hold.
    await updateProfile(u.id, { walletAddress: ADDR_B }, undefined, 'password');

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.walletAddressChangedAt?.toISOString())
      .toBe(before?.walletAddressChangedAt?.toISOString());
  });
});

describe('cooling-off after an address change', () => {
  it('holds a withdrawal while the new address is fresh', async () => {
    const u = await makeUser();
    await fundMain(u.id, 5_000);
    await updateProfile(u.id, { walletAddress: ADDR_B }, undefined, 'password');

    await expect(requestWithdrawal(u.id, '100', ADDR_B, undefined, 'totp'))
      .rejects.toMatchObject({ code: 'PAYOUT_ADDRESS_HOLD' });
  });

  it('holds it even when the payout is sent somewhere else entirely', async () => {
    const u = await makeUser();
    await fundMain(u.id, 5_000);
    await updateProfile(u.id, { walletAddress: ADDR_B }, undefined, 'password');

    // The hold is on the account, not on one address — otherwise an attacker
    // changes the saved address and then simply withdraws to a third one.
    await expect(requestWithdrawal(u.id, '100', ADDR_A, undefined, 'totp'))
      .rejects.toMatchObject({ code: 'PAYOUT_ADDRESS_HOLD' });
  });

  it('releases once the window has passed', async () => {
    const u = await makeUser();
    await fundMain(u.id, 5_000);
    await updateProfile(u.id, { walletAddress: ADDR_B }, undefined, 'password');
    await ageAddressChange(u.id, 25);

    await expect(requestWithdrawal(u.id, '100', ADDR_B, undefined, 'totp')).resolves.toBeTruthy();
  });

  it('still holds one minute before the window closes', async () => {
    const u = await makeUser();
    await fundMain(u.id, 5_000);
    await updateProfile(u.id, { walletAddress: ADDR_B }, undefined, 'password');
    await ageAddressChange(u.id, 23.9);

    await expect(requestWithdrawal(u.id, '100', ADDR_B, undefined, 'totp'))
      .rejects.toMatchObject({ code: 'PAYOUT_ADDRESS_HOLD' });
  });

  it('is disabled when the operator sets the hold to zero', async () => {
    await setSetting('WITHDRAWAL_ADDRESS_HOLD_HOURS', 0);
    const u = await makeUser();
    await fundMain(u.id, 5_000);
    await updateProfile(u.id, { walletAddress: ADDR_B }, undefined, 'password');

    await expect(requestWithdrawal(u.id, '100', ADDR_B, undefined, 'totp')).resolves.toBeTruthy();
  });

  it('a member who never changed their address is never held', async () => {
    const u = await makeUser();
    await fundMain(u.id, 5_000);
    await expect(requestWithdrawal(u.id, '100', ADDR_A, undefined, 'totp')).resolves.toBeTruthy();
  });
});

describe('the step-up ticket itself', () => {
  it('is issued for a correct password and verifies for that session', async () => {
    const u = await makeUser();
    const { token, method } = await issueStepUp(u.id, 'session-1', { password: PASSWORD });
    expect(method).toBe('password');
    expect(verifyStepUp(token, u.id, 'session-1')).toBe('password');
  });

  it('is refused for a wrong password', async () => {
    const u = await makeUser();
    await expect(issueStepUp(u.id, 'session-1', { password: 'wrong' })).rejects.toThrow();
  });

  it('cannot be replayed from a different session', async () => {
    const u = await makeUser();
    const { token } = await issueStepUp(u.id, 'session-1', { password: PASSWORD });

    // A ticket lifted off one device must be worthless on another.
    expect(() => verifyStepUp(token, u.id, 'session-2')).toThrow();
  });

  it('cannot be used by a different member', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const { token } = await issueStepUp(a.id, 'session-1', { password: PASSWORD });

    expect(() => verifyStepUp(token, b.id, 'session-1')).toThrow();
  });

  it('refuses a code when the member never enrolled two-factor', async () => {
    /**
     * The trap this guards. `verifyChallenge` answers "may this member pass the
     * 2FA gate", and for someone with no gate the answer is yes — correct for
     * sign-in, catastrophic here, because a caller asking to be verified *by
     * code* would be told they succeeded without one existing.
     */
    const u = await makeUser();
    await expect(issueStepUp(u.id, 'session-1', { code: '123456' }))
      .rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
  });

  it('rejects a garbage ticket rather than ignoring it', async () => {
    const u = await makeUser();
    expect(() => verifyStepUp('not-a-token', u.id, 'session-1')).toThrow();
  });
});
