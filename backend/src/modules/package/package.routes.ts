import { Router } from 'express';
import * as c from './package.controller.js';
import { asyncHandler } from '../../middleware/async-handler.js';

const r = Router();
r.get('/', asyncHandler(c.list));
export default r;
