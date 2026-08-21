import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../core/errors.js';
import { config } from '../core/runtime-config.js';

/**
 * Maintenance mode.
 *
 * Closes the member app while an operator works, and does it by refusing
 * requests rather than by taking the process down — which matters, because the
 * things that must keep running during maintenance are exactly the things a
 * process shutdown would stop: the payout worker, the deposit watcher, the
 * scheduled ROI run.
 *
 * Three deliberate exemptions:
 *
 *   • **Operators keep full access**, or nobody can turn it off again.
 *   • **Reads are still allowed.** A member checking their balance during
 *     maintenance is harmless; what needs stopping is money moving while
 *     something is half-migrated. Blocking reads only produces support tickets.
 *   • **Sign-out still works**, so nobody is trapped in a session.
 */
const ALWAYS_ALLOWED = [
  '/auth/logout',
  '/auth/refresh',
  '/health',
];

export async function maintenanceGate(req: Request, res: Response, next: NextFunction) {
  /**
   * Operators are how maintenance ends, so they are never gated.
   *
   * Matched on the mount path rather than on `req.adminId`: this runs before
   * the admin router, so the identity has not been resolved yet. Every operator
   * route lives under /admin and each one is behind `requireAdmin` anyway, so
   * the path is the reliable signal here and authentication still happens.
   */
  if (req.path.startsWith('/admin')) return next();
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (ALWAYS_ALLOWED.some((p) => req.path.startsWith(p))) return next();

  const cfg = await config();
  if (!cfg.maintenanceMode) return next();

  next(new AppError(cfg.maintenanceMessage, 503, 'MAINTENANCE_MODE'));
}

/**
 * Advertises the state on every response so the client can show a banner
 * without a separate poll — the information is already travelling.
 */
export async function maintenanceHeader(_req: Request, res: Response, next: NextFunction) {
  try {
    const cfg = await config();
    if (cfg.maintenanceMode) res.setHeader('X-Maintenance-Mode', 'on');
  } catch {
    // Config is cached and rarely fails; a missing header is not worth a 500.
  }
  next();
}
