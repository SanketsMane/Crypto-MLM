import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './core/logger.js';
import { prisma } from './core/db.js';
import { flushNotifications } from './core/notify.js';
import { flushActivity } from './core/activity.js';
import { flushErrors, installProcessHandlers } from './core/error-reporter.js';
import { syncPermissions } from './modules/admin/rbac/rbac.service.js';
import { payoutRail } from './core/payout-rail.js';

// Before anything else, so a fault during boot is recorded rather than lost.
installProcessHandlers();

/**
 * Refuse to serve on a payout configuration that would pay twice.
 *
 * Both rails able to send, with nothing naming which, means every approval
 * spends the member's net amount twice. `assertPayoutRail` already blocks the
 * approval itself, but a platform that boots quietly into that state and only
 * fails when an operator clicks Approve has left the fault to be discovered at
 * the worst moment. This is the same reasoning as the placeholder-secret check
 * in config/env.ts: loud at boot beats silent until it matters.
 */
const rail = payoutRail();
if (rail.ambiguous) {
  logger.fatal({ reason: rail.reason }, 'refusing to start — payout configuration is ambiguous');
  process.exit(1);
}
logger.info({ rail: rail.rail, reason: rail.reason }, 'payout rail resolved');

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`FortuneX API listening on http://localhost:${env.PORT}/api/v1`);
});

/**
 * Reconcile permissions with the code before serving.
 *
 * A new permission key that never reaches the database turns its routes into a
 * 403 for everyone, including the Super Admin, with no obvious cause. Doing it
 * at boot means adding a capability is a code change and nothing else.
 */
void syncPermissions()
  .then(({ permissions, granted }) => {
    logger.info({ permissions, granted }, 'permissions synchronised');
  })
  .catch((err: unknown) => {
    // Not fatal: an existing deployment keeps working on what it already has.
    logger.error({ err }, 'could not synchronise permissions');
  });

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.close();

  // Notifications and activity are written off the request path, so a deploy
  // landing mid-write would otherwise lose them. Nothing here is slow enough to
  // hold up a restart, but a member's "your payout address changed" alert
  // disappearing because of a rolling deploy is not acceptable.
  await Promise.race([
    Promise.all([flushNotifications(), flushActivity(), flushErrors()]),
    new Promise((r) => setTimeout(r, 5_000)),
  ]);

  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
