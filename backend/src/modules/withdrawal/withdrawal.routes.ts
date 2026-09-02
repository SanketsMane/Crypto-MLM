import { Router } from 'express';
import * as c from './withdrawal.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { idempotent } from '../../middleware/idempotency.js';
import { requireStepUp } from '../../middleware/step-up.js';

const r = Router();
r.use(requireAuth);
r.get('/', asyncHandler(c.list));
r.get('/quote', asyncHandler(c.quote));
r.post('/', requireStepUp, idempotent, asyncHandler(c.request));
export default r;
