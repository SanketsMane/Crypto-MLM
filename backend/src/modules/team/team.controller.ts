import type { Request, Response } from 'express';
import * as service from './team.service.js';

export const summary = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.summary(req.userId!) });

export const genealogy = async (req: Request, res: Response) => {
  // Depth is capped at the 30 levels the compensation plan pays on — a request
  // for more is a request for rows nobody earns from.
  const raw = req.query.depth ? Number(req.query.depth) : null;
  const depth = raw && Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 30) : null;
  res.json({ success: true, data: await service.genealogy(req.userId!, depth) });
};

export const level = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.getLevel(req.userId!, Number(req.params.level)) });

export const teamPackages = async (req: Request, res: Response) => {
  const level = req.query.level ? Number(req.query.level) : undefined;
  res.json({
    success: true,
    data: await service.teamPackages(req.userId!, {
      level: level && level >= 1 && level <= 30 ? level : undefined,
      take: req.query.take ? Number(req.query.take) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    }),
  });
};
