import type { Request, Response } from 'express';
import { z } from 'zod';
import * as account from './account.service.js';
import * as twoFactor from './two-factor.service.js';

const code6 = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

// ── email verification ──

export const sendVerification = async (req: Request, res: Response) => {
  res.json({ success: true, data: await account.sendVerification(req.userId!) });
};

const confirmSchema = z.object({ challengeId: z.string().min(10), code: code6 });

export const confirmVerification = async (req: Request, res: Response) => {
  const { challengeId, code } = confirmSchema.parse(req.body);
  res.json({ success: true, data: await account.confirmVerification(req.userId!, challengeId, code, req) });
};

// ── password reset ──

const forgotSchema = z.object({ email: z.string().trim().min(3) });

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = forgotSchema.parse(req.body);
  res.json({ success: true, data: await account.requestPasswordReset(email) });
};

const resetSchema = z.object({
  challengeId: z.string().min(10),
  code: code6,
  newPassword: z.string().min(8),
});

export const resetPassword = async (req: Request, res: Response) => {
  const body = resetSchema.parse(req.body);
  res.json({ success: true, data: await account.resetPassword({ ...body, req }) });
};

const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const changePassword = async (req: Request, res: Response) => {
  const body = changeSchema.parse(req.body);
  res.json({ success: true, data: await account.changePassword({ userId: req.userId!, ...body, req }) });
};

// ── two-factor ──

export const twoFactorStatus = async (req: Request, res: Response) => {
  res.json({ success: true, data: await twoFactor.status(req.userId!) });
};

const beginSchema = z.object({ password: z.string().min(1) });

export const twoFactorBegin = async (req: Request, res: Response) => {
  const { password } = beginSchema.parse(req.body);
  res.json({ success: true, data: await twoFactor.begin(req.userId!, password) });
};

const confirm2faSchema = z.object({ code: code6 });

export const twoFactorConfirm = async (req: Request, res: Response) => {
  const { code } = confirm2faSchema.parse(req.body);
  res.json({ success: true, data: await twoFactor.confirm(req.userId!, code, req) });
};

// A recovery code is accepted here too, which is the whole point of having them.
const disableSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().min(6),
});

export const twoFactorDisable = async (req: Request, res: Response) => {
  const { password, code } = disableSchema.parse(req.body);
  res.json({ success: true, data: await twoFactor.disable(req.userId!, password, code, req) });
};

const regenSchema = z.object({ password: z.string().min(1), code: code6 });

export const twoFactorRegenerate = async (req: Request, res: Response) => {
  const { password, code } = regenSchema.parse(req.body);
  res.json({ success: true, data: await twoFactor.regenerate(req.userId!, password, code) });
};
