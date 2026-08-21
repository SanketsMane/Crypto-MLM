import type { Request, Response } from 'express';
import * as service from './config.service.js';

/**
 * Public, unauthenticated, and cached at the edge for a minute.
 *
 * A visitor deciding whether to join needs the terms as much as a member does,
 * and every page on both apps reads this — so it has to be cheap.
 */
export const publicConfig = async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ success: true, data: await service.publicConfig() });
};
