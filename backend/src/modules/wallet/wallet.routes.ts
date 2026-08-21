import { Router } from 'express';
import * as c from './wallet.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { idempotent } from '../../middleware/idempotency.js';

const r = Router();
r.use(requireAuth);
r.get('/', asyncHandler(c.balances));
r.get('/ledger', asyncHandler(c.ledger));
r.post('/transfer', idempotent, asyncHandler(c.transfer));
export default r;
