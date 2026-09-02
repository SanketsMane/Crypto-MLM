import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../core/errors.js';
import { stepUpRequired, verifyStepUp, type StepUpMethod } from '../modules/auth/step-up.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** How the caller re-authenticated for this request, if they did. */
      stepUpMethod?: StepUpMethod;
    }
  }
}

const HEADER = 'x-step-up';

/**
 * Reads a step-up ticket if one was sent, and rejects a bad one outright.
 *
 * Split from `requireStepUp` because one endpoint needs it conditionally:
 * `PATCH /customer/profile` only demands re-authentication when the payout
 * address is actually changing, so it has to see the body before it can decide.
 * A ticket that is present but invalid always fails here — silently ignoring a
 * malformed ticket would let a caller probe for the shape of a valid one.
 */
export function readStepUp(req: Request, _res: Response, next: NextFunction) {
  const raw = req.header(HEADER);
  if (!raw) return next();
  if (!req.userId || !req.sessionId) return next(unauthorized());
  try {
    req.stepUpMethod = verifyStepUp(raw, req.userId, req.sessionId);
    next();
  } catch (err) {
    next(err);
  }
}

/** Refuses the request unless a valid step-up ticket accompanies it. */
export function requireStepUp(req: Request, _res: Response, next: NextFunction) {
  const raw = req.header(HEADER);
  if (!raw) {
    return next(stepUpRequired('Confirm it is you before continuing.'));
  }
  if (!req.userId || !req.sessionId) return next(unauthorized());
  try {
    req.stepUpMethod = verifyStepUp(raw, req.userId, req.sessionId);
    next();
  } catch (err) {
    next(err);
  }
}
