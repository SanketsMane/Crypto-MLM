import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { prisma } from './db.js';
import { logger } from './logger.js';

/**
 * Metrics.
 *
 * Deliberately not only HTTP counters. Request rate and latency tell you the
 * server is up; they do not tell you that payouts stopped going out four hours
 * ago, which is the failure that actually costs a platform its members. So the
 * business gauges below are collected on scrape, straight from the tables the
 * engine writes.
 *
 * Prometheus format because it is what everything reads. If nothing is scraping
 * yet, this costs one endpoint and no runtime overhead — collection only
 * happens when someone asks.
 */

export const registry = new Registry();

registry.setDefaultLabels({ service: 'fortunex-api' });
collectDefaultMetrics({ register: registry });

// ── HTTP ─────────────────────────────────────────────────────────────────────

export const httpRequests = new Counter({
  name: 'fortunex_http_requests_total',
  help: 'HTTP requests by method, route and status',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: 'fortunex_http_request_duration_seconds',
  help: 'How long requests take, by route',
  labelNames: ['method', 'route'] as const,
  // Tuned for an API, not a page load: the interesting question is which
  // requests cross 100ms and which cross a second.
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// ── money ────────────────────────────────────────────────────────────────────

export const ledgerEntries = new Counter({
  name: 'fortunex_ledger_entries_total',
  help: 'Ledger entries written, by category and direction',
  labelNames: ['category', 'direction'] as const,
  registers: [registry],
});

export const jobRuns = new Counter({
  name: 'fortunex_job_runs_total',
  help: 'Background job runs, by name and outcome',
  labelNames: ['job', 'outcome'] as const,
  registers: [registry],
});

/**
 * The gauges an operator would actually be paged on.
 *
 * Collected at scrape time rather than kept in memory, so they are correct
 * across a restart and across more than one API process — an in-memory counter
 * of pending withdrawals would be wrong the moment a second container starts.
 */
function businessGauge(name: string, help: string, collect: () => Promise<number>) {
  return new Gauge({
    name,
    help,
    registers: [registry],
    async collect() {
      try {
        this.set(await collect());
      } catch (err) {
        // A metrics failure must never take down the endpoint that reports the
        // system is healthy.
        logger.warn({ err, metric: name }, 'metric collection failed');
      }
    },
  });
}

businessGauge(
  'fortunex_withdrawals_pending',
  'Withdrawals awaiting operator approval',
  () => prisma.withdrawal.count({ where: { status: 'PENDING' } }),
);

businessGauge(
  'fortunex_withdrawals_overdue',
  'Pending withdrawals past their SLA — members already debited and waiting',
  () => prisma.withdrawal.count({ where: { status: 'PENDING', slaDueAt: { lt: new Date() } } }),
);

businessGauge(
  'fortunex_deposits_pending',
  'Reported deposits awaiting confirmation',
  () => prisma.deposit.count({ where: { status: 'PENDING' } }),
);

businessGauge(
  'fortunex_payouts_stuck',
  'On-chain payouts that failed or reverted and need an operator',
  () => prisma.chainPayout.count({ where: { status: { in: ['FAILED', 'REVERTED'] } } }),
);

businessGauge(
  'fortunex_kyc_pending',
  'Identity submissions awaiting review',
  () => prisma.kycSubmission.count({ where: { status: 'PENDING' } }),
);

businessGauge(
  'fortunex_tickets_open',
  'Support tickets awaiting a reply',
  () => prisma.supportTicket.count({ where: { status: 'OPEN' } }),
);

businessGauge(
  'fortunex_members_active',
  'Members with an active account',
  () => prisma.user.count({ where: { status: 'ACTIVE' } }),
);

businessGauge(
  'fortunex_member_balances_total',
  'Sum of every member wallet balance — the platform liability',
  async () => {
    const r = await prisma.walletAccount.aggregate({ _sum: { balance: true } });
    return Number(r._sum.balance ?? 0);
  },
);

businessGauge(
  'fortunex_investments_active',
  'Packages currently accruing',
  () => prisma.investment.count({ where: { status: 'ACTIVE' } }),
);

/**
 * When the last ROI run finished, as a unix timestamp.
 *
 * The single most useful number here: if this stops advancing, members are not
 * being paid, and nothing else on this page would tell you.
 */
businessGauge(
  'fortunex_last_roi_accrual_timestamp',
  'Unix time of the most recent ROI accrual',
  async () => {
    const last = await prisma.roiAccrual.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return last ? Math.floor(last.createdAt.getTime() / 1000) : 0;
  },
);
