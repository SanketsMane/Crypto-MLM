import { Queue, Worker, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';
import { runDailyRoi } from './daily-roi.job.js';
import { evaluate as evaluateRank } from '../modules/rank/rank.service.js';
import { recalculate } from '../modules/team/team.service.js';
import { purgeExpiredSessions } from '../core/sessions.js';
import { purgeExpiredOtpChallenges } from '../core/otp.js';
import { scanForDeposits } from '../core/chain/watcher.js';
import { processQueue as processPayouts } from '../core/chain/payouts.js';
import { chainState } from '../core/chain/config.js';
import { sendEarningsDigest } from './earnings-digest.job.js';
import { runOpsWatch } from './ops-watch.job.js';
import { purgeOldNotifications } from '../core/notify.js';
import { notifyAdmins } from '../core/notify.js';
import { purgeExpiredIdempotencyKeys } from '../middleware/idempotency.js';
import { runWithContext } from '../middleware/request-context.js';
import crypto from 'node:crypto';

export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUE = 'fortunex';
export const queue = new Queue(QUEUE, { connection });

const defaults: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 500,
  removeOnFail: 1000,
};

export async function scheduleRecurring() {
  // BullMQ 6 replaced repeatable jobs with job schedulers.

  // 00:10 UTC daily. The job itself skips non-trading days.
  await queue.upsertJobScheduler(
    'daily-roi',
    { pattern: '10 0 * * *' },
    { name: 'daily-roi', data: {}, opts: defaults },
  );

  // 03:30 UTC daily. Expired sessions and spent idempotency keys are dead
  // weight — they are only ever read by key, so leaving them costs storage
  // rather than correctness, but a table that only grows is its own problem.
  await queue.upsertJobScheduler(
    'maintenance',
    { pattern: '30 3 * * *' },
    { name: 'maintenance', data: {}, opts: defaults },
  );

  // The chain jobs are only scheduled when the chain is actually configured.
  // A scheduler entry that fires every 30 seconds into a disabled subsystem is
  // just noise in the logs.
  if (chainState().enabled) {
    // Every 30s. BSC produces a block roughly every 3 seconds, so this stays
    // well ahead of the confirmation depth without hammering the RPC.
    await queue.upsertJobScheduler(
      'chain-scan',
      { every: 30_000 },
      { name: 'chain-scan', data: {}, opts: { ...defaults, attempts: 1 } },
    );
    await queue.upsertJobScheduler(
      'chain-payouts',
      { every: 60_000 },
      { name: 'chain-payouts', data: {}, opts: { ...defaults, attempts: 1 } },
    );
  }

  // 00:40 UTC — half an hour after the ROI run, so the day's earnings are
  // settled before they are summarised.
  await queue.upsertJobScheduler(
    'earnings-digest',
    { pattern: '40 0 * * *' },
    { name: 'earnings-digest', data: {}, opts: defaults },
  );

  // Every 15 minutes. Conditions, not events — a withdrawal past its SLA is
  // normal at the moment it is created and a problem some hours later.
  await queue.upsertJobScheduler(
    'ops-watch',
    { every: 900_000 },
    { name: 'ops-watch', data: {}, opts: { ...defaults, attempts: 1 } },
  );

  logger.info('recurring jobs scheduled');
}

export function startWorker() {
  const worker = new Worker(
    QUEUE,
    async (job) =>
      // A job has no HTTP request behind it, so it opens its own trace. Money
      // moved by the scheduler has to be as reconstructable as money moved by
      // a member.
      runWithContext({ requestId: `job-${job.name}-${crypto.randomUUID()}` }, async () => {
        switch (job.name) {
          case 'daily-roi':
            return runDailyRoi();
          case 'maintenance':
            return {
              sessions: await purgeExpiredSessions(),
              idempotencyKeys: await purgeExpiredIdempotencyKeys(),
              otpChallenges: await purgeExpiredOtpChallenges(),
              notifications: await purgeOldNotifications(),
            };
          case 'earnings-digest':
            return sendEarningsDigest();
          case 'ops-watch':
            return runOpsWatch();
          case 'chain-scan':
            return scanForDeposits();
          case 'chain-payouts':
            return processPayouts();
          case 'recalculate-team':
            return recalculate(job.data.userId as string);
          case 'evaluate-rank':
            return evaluateRank(job.data.userId as string);
          default:
            logger.warn({ name: job.name }, 'unknown job');
        }
      }),
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ job: job?.name, err }, 'job failed');

    // A payout run or an ROI run that failed silently is how a platform stops
    // paying people without anyone noticing until they complain.
    if (job && ['daily-roi', 'chain-payouts', 'chain-scan'].includes(job.name)) {
      notifyAdmins({
        type: 'system.job_failed',
        dedupeKey: `job-failed:${job.name}:${new Date().toISOString().slice(0, 13)}`,
        title: `The ${job.name} job failed`,
        body: `${err.message.slice(0, 200)} — this job moves money, so it needs looking at now.`,
        meta: { job: job.name, error: err.message.slice(0, 500), attempts: job.attemptsMade },
      });
    }
  });
  worker.on('completed', (job) => logger.debug({ job: job.name }, 'job completed'));
  return worker;
}
