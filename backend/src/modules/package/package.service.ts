import { prisma } from '../../core/db.js';

export const listActive = () =>
  prisma.packagePlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });

export const findById = (id: string) => prisma.packagePlan.findUnique({ where: { id } });

export const listAll = () => prisma.packagePlan.findMany({ orderBy: { sortOrder: 'asc' } });
