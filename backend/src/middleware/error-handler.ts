import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Returned on every failure so a member can quote it in a support ticket and
  // an operator can pull the exact request out of the log.
  const requestId = req.requestId;
  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.issues, requestId },
    });
  }

  // Express's body parser throws this before any handler runs; without a case
  // here it surfaced as a 500 "request entity too large", which reads as a
  // server fault for what is really "your file is too big".
  if ((err as { type?: string }).type === 'entity.too.large') {
    const isUpload = /\/kyc\/?$/.test(req.path);
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: isUpload
          ? 'That upload is too large. Documents must be 8MB or smaller each.'
          : 'That request is too large.',
        requestId,
      },
    });
  }

  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json({ success: false, error: { code: err.code, message: err.message, details: err.details, requestId } });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 on a ledger reference means a replayed payout was correctly rejected.
    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE', message: 'This operation was already recorded', requestId },
      });
    }
  }

  logger.error({ err }, 'unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isProd ? 'Something went wrong' : String((err as Error)?.message ?? err),
      requestId,
    },
  });
}
