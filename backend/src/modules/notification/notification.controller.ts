import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ActorType, NotificationCategory } from '@prisma/client';
import { unauthorized } from '../../core/errors.js';
import * as service from './notification.service.js';

/**
 * One controller serving both consoles.
 *
 * A member reading their bell and an operator reading theirs are the same
 * operation against a different actor, so the identity is resolved once here
 * and everything downstream is scoped by it. Two parallel implementations
 * would drift, and the half that drifts is the one that leaks.
 */
function actor(req: Request): { actorType: ActorType; actorId: string } {
  if (req.adminId) return { actorType: 'ADMIN', actorId: req.adminId };
  if (req.userId) return { actorType: 'USER', actorId: req.userId };
  throw unauthorized();
}

const CATEGORIES = [
  'MONEY', 'EARNINGS', 'NETWORK', 'SECURITY',
  'COMPLIANCE', 'SUPPORT', 'OPERATIONS', 'SYSTEM',
] as const;

const category = z.enum(CATEGORIES).optional();
const ids = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

export const list = async (req: Request, res: Response) => {
  const { actorType, actorId } = actor(req);
  res.json({
    success: true,
    data: await service.list(actorType, actorId, {
      take: req.query.take ? Number(req.query.take) : undefined,
      cursor: req.query.cursor ? String(req.query.cursor) : undefined,
      category: category.parse(req.query.category) as NotificationCategory | undefined,
      unreadOnly: req.query.unreadOnly === 'true',
      includeArchived: req.query.includeArchived === 'true',
    }),
  });
};

/** Polled by every open tab, so it stays deliberately small. */
export const summary = async (req: Request, res: Response) => {
  const { actorType, actorId } = actor(req);
  res.json({ success: true, data: await service.summary(actorType, actorId) });
};

export const markRead = async (req: Request, res: Response) => {
  const { actorType, actorId } = actor(req);
  const body = ids.parse(req.body);
  res.json({ success: true, data: await service.markRead(actorType, actorId, body.ids) });
};

export const markUnread = async (req: Request, res: Response) => {
  const { actorType, actorId } = actor(req);
  res.json({ success: true, data: await service.markUnread(actorType, actorId, String(req.params.id)) });
};

export const markAllRead = async (req: Request, res: Response) => {
  const { actorType, actorId } = actor(req);
  const parsed = category.parse(req.body?.category) as NotificationCategory | undefined;
  res.json({ success: true, data: await service.markAllRead(actorType, actorId, parsed) });
};

export const archive = async (req: Request, res: Response) => {
  const { actorType, actorId } = actor(req);
  const body = ids.parse(req.body);
  res.json({ success: true, data: await service.archive(actorType, actorId, body.ids) });
};

export const restore = async (req: Request, res: Response) => {
  const { actorType, actorId } = actor(req);
  res.json({ success: true, data: await service.restore(actorType, actorId, String(req.params.id)) });
};

export const clearRead = async (req: Request, res: Response) => {
  const { actorType, actorId } = actor(req);
  res.json({ success: true, data: await service.clearRead(actorType, actorId) });
};

export const preferences = async (req: Request, res: Response) => {
  const { actorType, actorId } = actor(req);
  res.json({ success: true, data: await service.preferences(actorType, actorId) });
};

const prefBody = z.object({
  category: z.enum(CATEGORIES),
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
});

export const setPreference = async (req: Request, res: Response) => {
  const { actorType, actorId } = actor(req);
  const body = prefBody.parse(req.body);
  res.json({
    success: true,
    data: await service.setPreference(actorType, actorId, body.category, body),
  });
};
