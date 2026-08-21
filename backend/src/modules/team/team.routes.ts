import { Router } from 'express';
import * as c from './team.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';

const r = Router();
r.use(requireAuth);
r.get('/', asyncHandler(c.summary));
r.get('/genealogy', asyncHandler(c.genealogy));
r.get('/packages', asyncHandler(c.teamPackages));
r.get('/level/:level', asyncHandler(c.level));
export default r;
