import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PERMISSIONS, DEFAULT_ROLES } from '../src/modules/admin/rbac/permissions.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// permissions
for (const p of PERMISSIONS) {
  await prisma.permission.upsert({
    where: { key: p.key },
    create: { key: p.key, group: p.group, label: p.label, description: p.description },
    update: { group: p.group, label: p.label, description: p.description },
  });
}

// roles + their grants
for (const r of DEFAULT_ROLES) {
  const role = await prisma.adminRole.upsert({
    where: { slug: r.slug },
    create: { name: r.name, slug: r.slug, description: r.description, level: r.level, isSystem: r.isSystem },
    update: { name: r.name, description: r.description, level: r.level, isSystem: r.isSystem },
  });

  const perms = await prisma.permission.findMany({ where: { key: { in: r.permissions } }, select: { id: true } });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  console.log(`role ${r.name.padEnd(20)} ${perms.length} permissions`);
}

// restore the admin accounts
const superRole = await prisma.adminRole.findUniqueOrThrow({ where: { slug: 'super-admin' } });
const supportRole = await prisma.adminRole.findUniqueOrThrow({ where: { slug: 'support-agent' } });

const accounts = [
  { email: 'contactsanket1@gmail.com', name: 'Sanket', password: 'Sanket@3030', roleId: superRole.id },
  { email: 'admin@fortunex.local', name: 'Super Admin', password: 'Admin@12345', roleId: superRole.id },
  { email: 'support@fortunex.local', name: 'Support Agent', password: 'Support@12345', roleId: supportRole.id },
];

for (const a of accounts) {
  await prisma.adminUser.upsert({
    where: { email: a.email },
    create: { email: a.email, name: a.name, passwordHash: await bcrypt.hash(a.password, 12), roleId: a.roleId },
    update: { roleId: a.roleId, isActive: true },
  });
  console.log(`admin ${a.email}`);
}

console.log(`\n${PERMISSIONS.length} permissions, ${DEFAULT_ROLES.length} roles, ${accounts.length} admins`);
await prisma.$disconnect();
