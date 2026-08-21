import type { NextFunction, Request, Response } from 'express';
import { httpDuration, httpRequests } from '../core/metrics.js';

/**
 * Records every request against its route pattern, not its URL.
 *
 * `/api/v1/admin/users/:id` rather than `/api/v1/admin/users/cmt1z6q…` — one
 * label per route instead of one per member. Using the raw path would grow the
 * label set without bound, which is the classic way a metrics endpoint takes
 * down the process it was added to observe.
 */
export function metrics(req: Request, res: Response, next: NextFunction) {
  const done = httpDuration.startTimer();

  res.on('finish', () => {
    // Available only after routing, which is why this reads on finish.
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : normalise(req.baseUrl || req.path);

    const labels = { method: req.method, route };
    done(labels);
    httpRequests.inc({ ...labels, status: String(res.statusCode) });
  });

  next();
}

/**
 * A fallback for anything that never matched a route — a 404, or a mount with
 * no route pattern. Ids are collapsed so a scan for random paths cannot create
 * thousands of label values.
 */
const normalise = (path: string) =>
  path
    .replace(/\/c[a-z0-9]{20,}/g, '/:id')     // cuid
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')  // uuid
    .replace(/\/\d+/g, '/:n')
    .slice(0, 120) || '/';
