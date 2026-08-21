import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './kyc.service.js';
import { readStream } from '../../core/document-storage.js';

const submitSchema = z.object({
  fullName: z.string().min(2).max(120),
  documentNo: z.string().min(3).max(60),
  countryCode: z.string().min(2).max(2),
  dateOfBirth: z.string().optional(),
  documents: z.array(z.object({
    type: z.enum(['ID_FRONT', 'ID_BACK', 'PROOF_OF_ADDRESS', 'SELFIE']),
    mimeType: z.string().min(3).max(100),
    data: z.string().min(16),
  })).min(1).max(4),
});

export const current = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.current(req.userId!) });

export const submit = async (req: Request, res: Response) =>
  res.status(201).json({ success: true, data: await service.submit(req.userId!, submitSchema.parse(req.body), req) });

/** A member may re-read their own documents; nobody else's are reachable here. */
export const document = async (req: Request, res: Response) => {
  const doc = await service.document(req.userId!, String(req.params.docId));
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Cache-Control', 'private, no-store');
  readStream(doc.storageKey).pipe(res);
};
