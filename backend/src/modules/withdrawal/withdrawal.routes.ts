import { Router } from 'express';
import * as c from './withdrawal.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { idempotent } from '../../middleware/idempotency.js';

const r = Router();
r.use(requireAuth);
r.get('/', asyncHandler(c.list));
r.post('/', idempotent, asyncHandler(c.request));
export default r;
