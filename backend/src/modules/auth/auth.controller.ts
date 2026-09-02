import type { Request, Response } from 'express';
import * as service from './auth.service.js';
import { loginSchema, registerSchema } from './auth.validation.js';
import { badRequest, unauthorized } from '../../core/errors.js';
import { z } from 'zod';
import * as stepUp from './step-up.service.js';

const stepUpSchema = z.object({
  password: z.string().min(1).optional(),
  code: z.string().trim().min(6).max(12).optional(),
}).refine((v) => Boolean(v.password) || Boolean(v.code), {
  message: 'Provide either your password or an authenticator code',
});

/**
 * Re-authenticate, in exchange for a short-lived ticket that authorises a
 * payout-address change or a withdrawal. Rate limited like sign-in, because it
 * takes the same password.
 */
export const stepUpIssue = async (req: Request, res: Response) => {
  if (!req.userId || !req.sessionId) throw unauthorized();
  const input = stepUpSchema.parse(req.body);
  res.json({
    success: true,
    data: await stepUp.issueStepUp(req.userId, req.sessionId, input, req),
  });
};

export const register = async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  res.status(201).json({ success: true, data: await service.register(data, req) });
};

export const login = async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);
  res.json({ success: true, data: await service.login(data, req) });
};

export const refresh = async (req: Request, res: Response) => {
  const token = String(req.body?.refreshToken ?? '');
  if (!token) throw badRequest('refreshToken is required');
  res.json({ success: true, data: await service.refresh(token, req) });
};

export const logout = async (req: Request, res: Response) => {
  // Best effort: a client signing out should succeed even if its token has
  // already expired or been revoked elsewhere.
  const token = String(req.body?.refreshToken ?? '');
  if (token) await service.logout(token, req);
  res.json({ success: true, data: { ok: true } });
};

export const logoutEverywhere = async (req: Request, res: Response) => {
  const count = await service.logoutEverywhere(req.userId!, req);
  res.json({ success: true, data: { revoked: count } });
};

export const sessions = async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.activeSessions(req.userId!) });
};

export const endSession = async (req: Request, res: Response) => {
  await service.endSession(req.userId!, String(req.params.id), req);
  res.json({ success: true, data: { ok: true } });
};

export const me = async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.me(req.userId!) });
};

export const activity = async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: await service.activityTrail(req.userId!, {
      take: req.query.take ? Number(req.query.take) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
      event: req.query.event as never,
    }),
  });
};

export const completeTwoFactor = async (req: Request, res: Response) => {
  const challengeToken = String(req.body?.challengeToken ?? '');
  const code = String(req.body?.code ?? '');
  if (!challengeToken || !code) throw badRequest('challengeToken and code are required');
  res.json({ success: true, data: await service.completeTwoFactor(challengeToken, code, req) });
};

export const lookupSponsor = async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.lookupSponsor(String(req.params.code)) });
};
