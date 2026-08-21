import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './rbac.service.js';

const actor = (req: Request) => ({ id: req.admin!.id, roleLevel: req.admin!.roleLevel });

const roleSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(300).optional(),
  level: z.number().int().min(1).max(999),
  permissionKeys: z.array(z.string()).default([]),
});

const roleUpdateSchema = roleSchema.partial();

const adminSchema = z.object({
  email: z.email(),
  name: z.string().min(2).max(80),
  password: z.string().min(8).max(128),
  roleId: z.string().min(1),
});

const adminUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  roleId: z.string().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
});

export const catalogue = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.permissionCatalogue() });

export const listRoles = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.listRoles() });

export const createRole = async (req: Request, res: Response) =>
  res.status(201).json({ success: true, data: await service.createRole(actor(req), roleSchema.parse(req.body), req) });

export const updateRole = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.updateRole(actor(req), String(req.params.id), roleUpdateSchema.parse(req.body), req) });

export const deleteRole = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.deleteRole(actor(req), String(req.params.id), req) });

export const listAdmins = async (_req: Request, res: Response) =>
  res.json({ success: true, data: await service.listAdmins() });

export const createAdmin = async (req: Request, res: Response) =>
  res.status(201).json({ success: true, data: await service.createAdmin(actor(req), adminSchema.parse(req.body), req) });

export const updateAdmin = async (req: Request, res: Response) =>
  res.json({ success: true, data: await service.updateAdmin(actor(req), String(req.params.id), adminUpdateSchema.parse(req.body), req) });
