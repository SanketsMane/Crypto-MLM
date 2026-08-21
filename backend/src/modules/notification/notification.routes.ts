import { Router } from 'express';
import * as c from './notification.controller.js';
import { asyncHandler } from '../../middleware/async-handler.js';

/**
 * Mounted twice — under the member API behind `requireAuth`, and under the
 * admin API behind `requireAdmin`. The controller resolves whichever identity
 * the surrounding middleware established, so the two consoles cannot drift
 * apart in what they allow.
 */
export function notificationRoutes() {
  const r = Router();

  r.get('/', asyncHandler(c.list));
  r.get('/summary', asyncHandler(c.summary));
  r.get('/preferences', asyncHandler(c.preferences));

  r.post('/read', asyncHandler(c.markRead));
  r.post('/read-all', asyncHandler(c.markAllRead));
  r.post('/:id/unread', asyncHandler(c.markUnread));

  r.post('/archive', asyncHandler(c.archive));
  r.post('/:id/restore', asyncHandler(c.restore));
  r.post('/clear-read', asyncHandler(c.clearRead));

  r.patch('/preferences', asyncHandler(c.setPreference));

  return r;
}
