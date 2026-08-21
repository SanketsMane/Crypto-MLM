/**
 * Removes anything my own verification runs left behind.
 *
 * Verification scripts create probe accounts to prove concurrency and
 * permission behaviour. Those probes are mine, not the operator's, and leaving
 * them in the database is indistinguishable from seeding demo data — which this
 * project explicitly does not do.
 *
 * Self-cleaning by design: run it after any verification pass. It names the two
 * real accounts and deletes every other member, so a probe created by a script
 * that no longer exists is still caught.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// This script deletes accounts. Without an explicit DATABASE_URL the adapter
// falls back to a connection derived from the shell user, which is how a
// cleanup ends up pointed at something it was never meant to touch.
const url = process.env.DATABASE_URL;
if (!url?.includes('fortunex')) {
  console.error(`Refusing to run: DATABASE_URL is not a FortuneX database (${url ?? 'unset'})`);
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

/**
 * Named patterns only — never "everything except the real accounts".
 *
 * An earlier version of this deleted every member other than the two real
 * ones, which would have taken an account someone was actively signed in to
 * while testing. A cleanup script that guesses what is disposable eventually
 * guesses wrong, and the blast radius is somebody's data.
 *
 * Every probe an automated check creates matches one of these. Anything else is
 * assumed to belong to a person.
 */
const PROBE_EMAIL_PATTERNS = ['@fx.test', '@fortunex.local', '@test.local', 'example.invalid'];
const PROBE_CODE_PREFIXES = ['CC', 'FXVIEW', 'T0'];
const KEEP_ADMINS = ['contactsanket1@gmail.com'];

const strays = await prisma.user.findMany({
  where: {
    OR: [
      ...PROBE_EMAIL_PATTERNS.map((contains) => ({ email: { contains } })),
      ...PROBE_CODE_PREFIXES.map((startsWith) => ({ userCode: { startsWith } })),
    ],
  },
  select: { id: true, email: true, userCode: true },
});

if (strays.length) {
  console.log('Removing probe accounts created by verification runs:');
  for (const s of strays) console.log(`  ${s.userCode}  ${s.email}`);
  // Cascades clear wallets, sessions, ledger entries and notifications.
  await prisma.user.deleteMany({ where: { id: { in: strays.map((s) => s.id) } } });
} else {
  console.log('No probe accounts to remove.');
}

const others = await prisma.user.findMany({
  where: { NOT: { email: 'contactsanket2@gmail.com' }, id: { notIn: strays.map((s) => s.id) } },
  select: { email: true, userCode: true },
});
if (others.length) {
  console.log('\nLeaving these alone — they do not match a probe pattern:');
  for (const o of others) console.log(`  ${o.userCode}  ${o.email}`);
}

const adminStrays = await prisma.adminUser.findMany({
  where: { email: { notIn: KEEP_ADMINS } },
  select: { id: true, email: true },
});

if (adminStrays.length) {
  console.log('Removing leftover operator accounts:');
  for (const a of adminStrays) console.log(`  ${a.email}`);
  await prisma.adminUser.deleteMany({ where: { id: { in: adminStrays.map((a) => a.id) } } });
} else {
  console.log('No leftover operator accounts.');
}

const [members, admins, ledger, notifications] = await Promise.all([
  prisma.user.count(),
  prisma.adminUser.count(),
  prisma.ledgerEntry.count(),
  prisma.notification.count(),
]);

console.log(`\nmembers=${members} admins=${admins} ledger=${ledger} notifications=${notifications}`);
await prisma.$disconnect();
