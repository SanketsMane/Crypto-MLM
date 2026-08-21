import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 5 forwards async rejections, but this keeps intent explicit. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
