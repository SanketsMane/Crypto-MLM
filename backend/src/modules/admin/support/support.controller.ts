import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './support.service.js';
import * as memberSupport from '../../support/support.service.js';
import { readStream } from '../../../core/document-storage.js';

const replySchema = z.object({ body: z.string().min(2).max(4000) });
const statusSchema = z.object({ status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']) });

export const list = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.list({
      take: Math.min(Number(req.query.take ?? 50), 200),
      skip: Number(req.query.skip ?? 0),
      status: req.query.status ? (String(req.query.status) as never) : undefined,
      awaiting: req.query.awaiting === 'true',
      q: req.query.q ? String(req.query.q) : undefined,
    }),
  });

export const detail = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.detail(String(req.params.id)) });

export const reply = async (req: Request, res: Response) => {
  const { body } = replySchema.parse(req.body);
  res.json({ success: true, data: await service.reply(req.adminId!, String(req.params.id), body, req) });
};

export const setStatus = async (req: Request, res: Response) => {
  const { status } = statusSchema.parse(req.body);
  res.json({ success: true, data: await service.setStatus(req.adminId!, String(req.params.id), status, req) });
};

const triageSchema = z.object({
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  category: z.enum(['DEPOSIT', 'WITHDRAWAL', 'ACCOUNT', 'VERIFICATION', 'EARNINGS', 'TECHNICAL', 'OTHER']).optional(),
  assignedTo: z.string().nullable().optional(),
});

export const triage = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.triage(req.adminId!, String(req.params.id), triageSchema.parse(req.body), req) });

export const claim = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.claim(req.adminId!, String(req.params.id), req) });

/** Operators can read any ticket's attachments; entitlement is the permission. */
export const attachmentFile = async (req: Request, res: Response) => {
  const file = await memberSupport.attachment(String(req.params.attachmentId), { isStaff: true });
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  readStream(file.storageKey).pipe(res);
};
