import { Router } from 'express';
import * as c from './support.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';

const r = Router();
r.use(requireAuth);
r.get('/', asyncHandler(c.list));
r.post('/', asyncHandler(c.create));
r.post('/:id/reply', asyncHandler(c.reply));
r.get('/attachments/:attachmentId', asyncHandler(c.attachmentFile));
export default r;
