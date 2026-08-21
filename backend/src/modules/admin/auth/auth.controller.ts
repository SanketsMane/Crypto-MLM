import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './auth.service.js';
import { badRequest } from '../../../core/errors.js';

const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });

export const login = async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);
  res.json({ success: true, data: await service.login(email, password, req) });
};

export const me = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.me(req.adminId!) });

export const refresh = async (req: Request, res: Response) => {
  const token = String(req.body?.refreshToken ?? '');
  if (!token) throw badRequest('refreshToken is required');
  res.json({ success: true, data: await service.refresh(token, req) });
};

export const logout = async (req: Request, res: Response) => {
  const token = String(req.body?.refreshToken ?? '');
  if (token) await service.logout(token);
  res.json({ success: true, data: { ok: true } });
};

export const sessions = async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.activeSessions(req.adminId!) });
};

export const endSession = async (req: Request, res: Response) => {
  await service.endSession(req.adminId!, String(req.params.id));
  res.json({ success: true, data: { ok: true } });
};

// ── two-factor ──

const code6 = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const completeTwoFactor = async (req: Request, res: Response) => {
  const body = z.object({ challengeToken: z.string().min(10), code: z.string().trim().min(6) }).parse(req.body);
  res.json({ success: true, data: await service.completeTwoFactor(body.challengeToken, body.code, req) });
};

export const twoFactorStatus = async (req: Request, res: Response) => {
  res.json({ success: true, data: await service.twoFactorStatus(req.adminId!) });
};

export const twoFactorBegin = async (req: Request, res: Response) => {
  const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
  res.json({ success: true, data: await service.beginTwoFactor(req.adminId!, password) });
};

export const twoFactorConfirm = async (req: Request, res: Response) => {
  const { code } = z.object({ code: code6 }).parse(req.body);
  res.json({ success: true, data: await service.confirmTwoFactor(req.adminId!, code, req) });
};

export const twoFactorDisable = async (req: Request, res: Response) => {
  const body = z.object({ password: z.string().min(1), code: code6 }).parse(req.body);
  res.json({ success: true, data: await service.disableTwoFactor(req.adminId!, body.password, body.code, req) });
};
