import type { Request, Response } from 'express';
import * as service from './customer.service.js';
import * as dashboard from './dashboard.service.js';
import { env } from '../../config/env.js';

export const profile = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.profile(req.userId!) });

export const update = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.update(req.userId!, req.body, req, req.stepUpMethod) });

export const referral = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.referralLink(req.userId!, env.WEB_URL) });

export const summary = async (req: Request, res: Response) =>
  res.json({ success: true, data: await dashboard.summary(req.userId!, env.WEB_URL) });

export const incomeSeries = async (req: Request, res: Response) =>
  res.json({ success: true, data: await dashboard.incomeSeries(req.userId!, Number(req.query.days ?? 7)) });

export const activity = async (req: Request, res: Response) =>
  res.json({ success: true, data: await dashboard.activity(req.userId!, Number(req.query.take ?? 6)) });

export const levelStatus = async (req: Request, res: Response) =>
  res.json({ success: true, data: await dashboard.levelStatus(req.userId!) });
