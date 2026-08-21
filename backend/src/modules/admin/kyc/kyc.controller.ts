import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './kyc.service.js';
import { readStream } from '../../../core/document-storage.js';

const rejectSchema = z.object({ reason: z.string().min(3).max(300) });

export const list = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: await service.list({
      take: Math.min(Number(req.query.take ?? 50), 200),
      skip: Number(req.query.skip ?? 0),
      status: req.query.status ? (String(req.query.status) as never) : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
    }),
  });

export const detail = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.detail(String(req.params.id)) });

export const approve = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.approve(req.adminId!, String(req.params.id), req) });

export const reject = async (req: Request, res: Response) => {
  const { reason } = rejectSchema.parse(req.body);
  res.json({ success: true, data: await service.reject(req.adminId!, String(req.params.id), reason, req) });
};

/**
 * Streams an identity document to the reviewer. Never cached, never given a
 * public URL — the permission check on the route is the only way in.
 */
export const document = async (req: Request, res: Response) => {
  const doc = await service.document(String(req.params.docId));
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  readStream(doc.storageKey).pipe(res);
};
