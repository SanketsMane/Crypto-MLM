import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from '../../branding/branding.service.js';

/**
 * The console's face onto branding.
 *
 * Text branding is not here — it goes through the normal settings endpoints,
 * because it is normal settings. This module exists only for the artwork,
 * which cannot live in a string column.
 */

const uploadSchema = z.object({
  mimeType: z.string().min(1).max(100),
  /* The ceiling is enforced properly in `brand-storage.put`, against the
     decoded bytes. This bound only stops an absurd payload before we spend
     time decoding it — base64 is 4 bytes per 3, hence the headroom. */
  data: z.string().min(1).max(2 * 1024 * 1024),
});

/** Everything the branding screen needs to render, in one call. */
export const overview = async (_req: Request, res: Response) => {
  const [brand, assets] = await Promise.all([service.branding(), service.assets()]);
  res.json({
    success: true,
    data: {
      branding: brand,
      assets,
      /* The slot list and its guidance come from the server so the console
         cannot drift from what the upload endpoint will actually accept. */
      slots: service.SLOTS.map((slot) => ({ slot, guidance: service.SLOT_GUIDANCE[slot] })),
    },
  });
};

export const upload = async (req: Request, res: Response) => {
  const body = uploadSchema.parse(req.body);
  const asset = await service.upload(
    req.adminId!,
    { slot: String(req.params.slot), mimeType: body.mimeType, data: body.data },
    req,
  );
  res.json({ success: true, data: asset });
};

export const clear = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.clear(req.adminId!, String(req.params.slot), req) });
