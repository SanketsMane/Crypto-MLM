import { Router } from 'express';
import * as c from './kyc.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';

const r = Router();
r.use(requireAuth);
r.get('/', asyncHandler(c.current));

/** The larger body limit this route needs is applied in app.ts, which is where
 *  the JSON parser runs — see the note there. */
r.post('/', asyncHandler(c.submit));
r.get('/documents/:docId', asyncHandler(c.document));
export default r;
