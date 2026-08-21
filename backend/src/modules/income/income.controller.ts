import type { Request, Response } from 'express';
import * as service from './income.service.js';
import { badRequest } from '../../core/errors.js';

export const summary = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.summary(req.userId!) });

export const statement = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.statement(req.userId!, {
      take: Number(req.query.take ?? 50),
      skip: Number(req.query.skip ?? 0),
    }),
  });

/**
 * A statement for a period.
 *
 * Defaults to the calendar month containing `from`, because that is what
 * "my statement" almost always means.
 */
export const periodStatement = async (req: Request, res: Response) => {
  const now = new Date();
  const from = req.query.from
    ? new Date(String(req.query.from))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = req.query.to
    ? new Date(String(req.query.to))
    : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0, 23, 59, 59));

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    throw badRequest('Give a valid date range');
  }

  res.json({ success: true, data: await service.periodStatement(req.userId!, from, to) });
};

export const taxSummary = async (req: Request, res: Response) => {
  const now = new Date();
  const year = req.query.year ? Number(req.query.year) : now.getUTCFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > now.getUTCFullYear()) {
    throw badRequest('Choose a year between 2020 and now');
  }
  res.json({ success: true, data: await service.taxSummary(req.userId!, year) });
};
