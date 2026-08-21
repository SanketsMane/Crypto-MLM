import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from './contact.controller.js';
import { asyncHandler } from '../../middleware/async-handler.js';

const r = Router();

/** Public and unauthenticated, so it needs its own tighter ceiling. */
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many enquiries from this address. Try again later.' } },
});

r.post('/', contactLimiter, asyncHandler(c.submit));
export default r;
