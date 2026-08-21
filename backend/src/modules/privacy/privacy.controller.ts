import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './privacy.service.js';
import * as activity from '../../core/activity.js';

export const consents = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.consentStatus(req.userId!) });

const acceptSchema = z.object({
  documents: z.array(z.enum(['TERMS', 'PRIVACY', 'RISK_DISCLOSURE'])).min(1),
});

export const accept = async (req: Request, res: Response) => {
  const { documents } = acceptSchema.parse(req.body);
  res.json({ success: true, data: await service.accept(req.userId!, documents, req) });
};

/**
 * Streams the export as a download rather than a JSON body, so a browser saves
 * it instead of rendering a wall of text.
 */
export const exportData = async (req: Request, res: Response) => {
  const data = await service.exportFor(req.userId!);
  const stamp = new Date().toISOString().slice(0, 10);

  activity.record({
    userId: req.userId!, event: 'PROFILE_UPDATED', req,
    summary: 'Downloaded a copy of your account data',
  });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fortunex-account-data-${stamp}.json"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(JSON.stringify(data, null, 2));
};
