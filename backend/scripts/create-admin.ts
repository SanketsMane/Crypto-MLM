import 'dotenv/config';
import { prisma } from '../src/core/db.js';
import bcrypt from 'bcryptjs';

const [email, password, name, role] = process.argv.slice(2);
const admin = await prisma.adminUser.upsert({
  where: { email: email! },
  create: {
    email: email!, name: name ?? 'Admin',
    passwordHash: await bcrypt.hash(password!, 12),
    role: (role ?? 'SUPER_ADMIN') as never,
  },
  update: { passwordHash: await bcrypt.hash(password!, 12), role: (role ?? 'SUPER_ADMIN') as never, isActive: true },
});
console.log(`admin ready: ${admin.email}  role=${admin.role}  id=${admin.id}`);
await prisma.$disconnect();
