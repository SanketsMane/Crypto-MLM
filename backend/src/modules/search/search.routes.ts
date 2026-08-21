import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import * as service from './search.service.js';

/**
 * Mounted twice — under the member API behind `requireAuth`, and under the
 * admin API behind `requireAdmin`. Which identity is present decides which
 * search runs, so neither console can reach the other's scope.
 */
export function searchRoutes() {
  const r = Router();
  r.get('/', asyncHandler(async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '');
    const groups = req.adminId
      ? await service.forAdmin(q)
      : await service.forMember(req.userId!, q);
    res.json({ success: true, data: { query: q, groups } });
  }));
  return r;
}
