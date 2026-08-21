import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * A correlation id for every request.
 *
 * When a member says a payout is wrong, the question is what actually happened
 * — which request, which ledger entries, which commission rows, in what order.
 * Without a shared id those lines are scattered across the log by timestamp and
 * cannot be reassembled with any confidence.
 *
 * Every request now carries one. It is accepted from an upstream proxy if
 * present, so a trace survives the hop, and returned on the response so a
 * member can quote it in a support ticket. Async local storage carries it into
 * services and jobs without threading a parameter through every signature.
 */

export interface RequestContext {
  requestId: string;
  actorType?: 'USER' | 'ADMIN';
  actorId?: string;
  /**
   * Set while a simulation is driving the engine.
   *
   * Modelled members must not be emailed, notified or written to an activity
   * trail — none of them are real people, and half a million rows of it would
   * bury the notifications that matter. Carried in async local storage rather
   * than a module flag so a simulation running in one job cannot silence a real
   * member's alert being written at the same moment.
   */
  simulating?: boolean;
  /**
   * Which run is driving. Jobs scope their work to this run's members.
   *
   * Without it the ROI job would walk every active investment on the platform
   * and credit REAL members for days that have not happened — real money, in
   * the real ledger, effectively impossible to unwind.
   */
  simulationRunId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const currentContext = () => storage.getStore();
export const currentRequestId = () => storage.getStore()?.requestId;

/** True while a simulation is driving the engine. */
export const isSimulating = () => storage.getStore()?.simulating === true;

/** The run currently driving the engine, if any. */
export const simulationRunId = () => storage.getStore()?.simulationRunId;

/** Runs work under a context — used by background jobs, which have no request. */
export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn);

const HEADER = 'x-request-id';
const VALID = /^[A-Za-z0-9._-]{1,128}$/;

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const upstream = req.header(HEADER);
  const requestId = upstream && VALID.test(upstream) ? upstream : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader(HEADER, requestId);

  storage.run({ requestId }, () => {
    // The authenticated identity is not known yet — auth middleware runs later —
    // so it is filled in on the same context object once it is.
    next();
  });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
