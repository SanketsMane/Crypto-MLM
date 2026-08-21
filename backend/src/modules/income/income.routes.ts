import { Router } from 'express';
import * as c from './income.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';

const r = Router();
r.use(requireAuth);
r.get('/', asyncHandler(c.summary));
r.get('/statement', asyncHandler(c.statement));
r.get('/statement/period', asyncHandler(c.periodStatement));
r.get('/tax-summary', asyncHandler(c.taxSummary));
export default r;
