import { Router } from 'express';
import * as c from './rank.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';

const r = Router();
r.use(requireAuth);
r.get('/', asyncHandler(c.progress));
r.post('/evaluate', asyncHandler(c.evaluate));
/** The member's own instalment schedule. Scoped to req.userId — never a param. */
r.get('/reward-schedule', asyncHandler(c.rewardSchedule));
export default r;
