import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './support.service.js';
import { readStream } from '../../core/document-storage.js';

const attachment = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(3).max(100),
  data: z.string().min(1),
});

const createSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  body: z.string().trim().min(5).max(4000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  category: z.enum(['DEPOSIT', 'WITHDRAWAL', 'ACCOUNT', 'VERIFICATION', 'EARNINGS', 'TECHNICAL', 'OTHER']).optional(),
  attachments: z.array(attachment).max(3).optional(),
});

const replySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  attachments: z.array(attachment).max(3).optional(),
});

export const list = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.list(req.userId!) });

export const create = async (req: Request, res: Response) =>
  res.status(201).json({ success: true, data: await service.create(req.userId!, createSchema.parse(req.body)) });

export const reply = async (req: Request, res: Response) => {
  const body = replySchema.parse(req.body);
  res.json({
    success: true,
    data: await service.reply(String(req.params.id), req.userId!, body.body, false, body.attachments),
  });
};

/**
 * Streams a file rather than redirecting to one.
 *
 * Attachments live outside the web root and have no guessable URL — the only
 * way to read one is through here, where entitlement is checked first.
 */
export const attachmentFile = async (req: Request, res: Response) => {
  const file = await service.attachment(String(req.params.attachmentId), { userId: req.userId! });
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  readStream(file.storageKey).pipe(res);
};
