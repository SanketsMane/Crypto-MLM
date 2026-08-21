import { Router } from 'express';
import * as c from './deposit.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { idempotent } from '../../middleware/idempotency.js';

const r = Router();
r.use(requireAuth);
r.get('/', asyncHandler(c.list));
r.get('/address', asyncHandler(c.address));
r.post('/', idempotent, asyncHandler(c.create));
export default r;
