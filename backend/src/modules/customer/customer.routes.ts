import { Router } from 'express';
import * as c from './customer.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { readStepUp } from '../../middleware/step-up.js';

const r = Router();
r.use(requireAuth);
r.get('/profile', asyncHandler(c.profile));
// Reads a ticket if one is sent; the service decides whether one was needed,
// because only a payout-address change demands it.
r.patch('/profile', readStepUp, asyncHandler(c.update));
r.get('/dashboard', asyncHandler(c.summary));
r.get('/dashboard/income-series', asyncHandler(c.incomeSeries));
r.get('/dashboard/activity', asyncHandler(c.activity));
r.get('/levels', asyncHandler(c.levelStatus));
export default r;
