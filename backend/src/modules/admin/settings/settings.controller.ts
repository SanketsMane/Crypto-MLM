import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './settings.service.js';
import { PLAN_STRUCTURES } from '../../../core/plan-structure.js';

// Empty is meaningful for a few settings — an empty allowlist means "no
// restriction", which is not the same as never having set it.
const setSchema = z.object({ value: z.string().max(500) });

export const all = async (req: Request, res: Response) =>
  res.json({
    success: true,
    data: {
      settings: await service.all(),
      /* The selector needs each structure's copy and whether the engine can
         actually run it. Sent with the settings so the console does not need a
         second call to render one card. */
      planStructures: Object.values(PLAN_STRUCTURES),
      // So the allowlist field can show the operator their own address rather
      // than making them go and look it up.
      yourIp: req.ip ?? null,
    },
  });

export const set = async (req: Request, res: Response) => {
  const { value } = setSchema.parse(req.body);
  res.json({ success: true, data: await service.set(req.adminId!, String(req.params.key), value, req) });
};

export const reset = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.reset(req.adminId!, String(req.params.key), req) });
