import { Router } from 'express';
import * as c from './gateway.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';

const r = Router();

/* Callbacks are public — the signature is what authenticates them. Declared
   before `requireAuth` so no token is ever demanded of the gateway. */
r.post('/oxapay/payment', asyncHandler(c.paymentCallback));
r.post('/oxapay/payout', asyncHandler(c.payoutCallback));

r.get('/status', requireAuth, asyncHandler(c.status));
r.post('/deposit', requireAuth, asyncHandler(c.start));

export default r;
