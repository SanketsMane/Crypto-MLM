import { Router } from 'express';
import * as c from './lottery.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { idempotent } from '../../middleware/idempotency.js';

const r = Router();
r.use(requireAuth);
r.get('/', asyncHandler(c.view));
// Claiming pays money, so it carries the same replay protection as a purchase.
r.post('/prizes/:id/claim', idempotent, asyncHandler(c.claim));
export default r;
