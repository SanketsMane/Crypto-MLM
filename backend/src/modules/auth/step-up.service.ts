import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { prisma } from '../../core/db.js';
import { env } from '../../config/env.js';
import { AppError, unauthorized } from '../../core/errors.js';
import { config } from '../../core/runtime-config.js';
import * as twoFactor from '../../core/two-factor.js';
import * as activity from '../../core/activity.js';

/**
 * Re-authentication for the two actions that can move a member's money out of
 * the platform: changing the payout address, and requesting a withdrawal.
 *
 * A valid access token proves somebody signed in on this device at some point
 * in the last thirty days. It does not prove the person holding the phone right
 * now is the member. That difference is the whole attack: a stolen unlocked
 * device could change the payout address and drain the wallet without ever
 * knowing the password, because both endpoints asked for nothing beyond the
 * token they already had.
 *
 * The ticket is deliberately not an access token. It authorises one narrow
 * class of action, expires in minutes, and is bound to the session that minted
 * it — a step-up obtained on one device is useless from another, so a leaked
 * ticket cannot be replayed elsewhere.
 */

export type StepUpMethod = 'password' | 'totp';

/** Thrown when an endpoint needs a step-up and did not get a usable one. */
export const stepUpRequired = (message: string, need?: StepUpMethod) =>
  new AppError(message, 401, 'STEP_UP_REQUIRED', need ? { require: need } : undefined);

interface Ticket extends jwt.JwtPayload {
  sub: string;
  typ: 'step-up';
  sid: string;
  mth: StepUpMethod;
}

export async function issueStepUp(
  userId: string,
  sessionId: string,
  input: { password?: string; code?: string },
  req?: Request,
): Promise<{ token: string; method: StepUpMethod; expiresInSeconds: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw unauthorized();

  const cfg = await config();
  let method: StepUpMethod;

  if (input.code) {
    /**
     * `verifyChallenge` answers "is this member allowed past the 2FA gate",
     * and for somebody who never enrolled the honest answer is yes — there is
     * no gate. That is right for sign-in and wrong here: a caller asking to be
     * verified *by code* must not be told they passed because no code exists.
     */
    if (!(await twoFactor.isEnabled('USER', userId))) {
      throw stepUpRequired(
        'Two-factor authentication is not set up on this account. Turn it on in Security before continuing.',
      );
    }
    const result = await twoFactor.verifyChallenge('USER', userId, input.code);
    if (!result.ok) {
      activity.record({
        userId, event: 'SIGN_IN_FAILED', req,
        summary: 'Failed step-up — wrong authenticator code',
      });
      throw unauthorized('That code is not right. Check your authenticator app and try again.');
    }
    method = 'totp';
  } else if (input.password) {
    if (!(await bcrypt.compare(input.password, user.passwordHash))) {
      activity.record({
        userId, event: 'SIGN_IN_FAILED', req,
        summary: 'Failed step-up — wrong password',
      });
      throw unauthorized('That password is not right.');
    }
    method = 'password';
  } else {
    throw unauthorized('Confirm your password or enter an authenticator code.');
  }

  const seconds = Math.max(60, Math.round(cfg.stepUpTtlMinutes * 60));
  const token = jwt.sign(
    { sub: userId, typ: 'step-up', sid: sessionId, mth: method },
    env.JWT_ACCESS_SECRET,
    { expiresIn: seconds },
  );

  return { token, method, expiresInSeconds: seconds };
}

/**
 * Verifies a ticket against the caller who presented it.
 *
 * Both the member and the session are checked, not just the signature: a ticket
 * is only ever valid for the identity and the device it was minted for.
 */
export function verifyStepUp(token: string, userId: string, sessionId: string): StepUpMethod {
  let payload: Ticket;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as Ticket;
  } catch {
    throw stepUpRequired('Your confirmation expired. Please confirm again.');
  }
  if (payload.typ !== 'step-up') throw stepUpRequired('Please confirm it is you before continuing.');
  if (payload.sub !== userId || payload.sid !== sessionId) {
    throw stepUpRequired('Your confirmation does not match this session. Please confirm again.');
  }
  return payload.mth === 'totp' ? 'totp' : 'password';
}
