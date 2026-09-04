import { Router } from 'express';
import * as auth from './auth/auth.controller.js';
import * as rbac from './rbac/rbac.controller.js';
import * as users from './users/users.controller.js';
import * as finance from './finance/finance.controller.js';
import * as catalog from './catalog/catalog.controller.js';
import * as reports from './reports/reports.controller.js';
import * as dashboard from './dashboard/dashboard.controller.js';
import * as ledger from './ledger/ledger.controller.js';
import * as settings from './settings/settings.controller.js';
import * as audit from './audit/audit.controller.js';
import * as support from './support/support.controller.js';
import * as kyc from './kyc/kyc.controller.js';
import * as chain from './chain/chain.controller.js';
import { notificationRoutes } from '../notification/notification.routes.js';
import { searchRoutes } from '../search/search.routes.js';
import * as announcements from '../announcement/announcement.controller.js';
import * as impersonation from './impersonation/impersonation.controller.js';
import * as lottery from '../lottery/lottery.controller.js';
import * as simulation from './simulation/simulation.controller.js';
import * as errors from './errors/errors.controller.js';
import * as exporter from './export/export.controller.js';
import * as jobs from './jobs/jobs.controller.js';
import { requireAdmin, can } from '../../middleware/admin-auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { idempotent } from '../../middleware/idempotency.js';
import { authLimiter } from '../../middleware/rate-limit.js';

const r = Router();

/** Public */
r.post('/login', authLimiter, asyncHandler(auth.login));
r.post('/refresh', authLimiter, asyncHandler(auth.refresh));
r.post('/logout', asyncHandler(auth.logout));

/** Second step of sign-in. Rate limited like sign-in itself. */
r.post('/2fa/challenge', authLimiter, asyncHandler(auth.completeTwoFactor));

/** Authenticated. Each route below gates on a capability key, never a role name. */
r.use(requireAdmin);
r.get('/me', asyncHandler(auth.me));
r.get('/sessions', asyncHandler(auth.sessions));
r.delete('/sessions/:id', asyncHandler(auth.endSession));

/** Two-factor, managed from inside the console. */
r.get('/2fa', asyncHandler(auth.twoFactorStatus));
r.post('/2fa/begin', asyncHandler(auth.twoFactorBegin));
r.post('/2fa/confirm', asyncHandler(auth.twoFactorConfirm));
r.post('/2fa/disable', asyncHandler(auth.twoFactorDisable));

/** Dashboard & reports */
r.get('/dashboard',               can('dashboard.view'), asyncHandler(dashboard.summary));
r.get('/dashboard/investment-series', can('dashboard.view'), asyncHandler(dashboard.investmentSeries));
r.get('/reports/overview',        can('reports.view'),   asyncHandler(reports.overview));
r.get('/reports/top-earners',     can('reports.view'),   asyncHandler(reports.topEarners));
r.get('/reports/income-series',   can('reports.view'),   asyncHandler(reports.incomeSeries));
r.get('/reports/cohorts',          can('reports.view'), asyncHandler(reports.cohorts));
r.get('/reports/plan-performance', can('reports.view'), asyncHandler(reports.planPerformance));
r.get('/reports/solvency',         can('reports.view'), asyncHandler(reports.solvency));
r.get('/reports/cap-utilisation', can('reports.view'),   asyncHandler(reports.capUtilisation));
r.get('/queues',                  can('dashboard.view'), asyncHandler(finance.queues));

/** Customers */
r.get('/users',                          can('users.view'),   asyncHandler(users.list));
r.post('/users',                         can('users.create'), asyncHandler(users.create));
r.get('/users/:id',                      can('users.view'),   asyncHandler(users.detail));
r.patch('/users/:id/status',             can('users.status'), asyncHandler(users.setStatus));
r.patch('/users/:id/affiliate-mode',     can('users.mode'),   asyncHandler(users.setMode));
r.post('/users/bulk/status',             can('users.status'), idempotent, asyncHandler(users.bulkStatus));
r.post('/users/bulk/affiliate-mode',     can('users.mode'),   idempotent, asyncHandler(users.bulkAffiliateMode));
r.post('/users/:id/impersonate',         can('users.impersonate'), asyncHandler(impersonation.start));
r.post('/users/:id/adjust',              can('users.adjust'), idempotent, asyncHandler(users.adjust));
/* Manual adjustments above the threshold wait here for a SECOND operator.
   Same permission by design — the control is that the approver must be a
   different person, not that they hold a rarer role. */
r.get('/adjustments',                    can('users.adjust'), asyncHandler(users.pendingAdjustments));
r.post('/adjustments/:id/approve',       can('users.adjust'), idempotent, asyncHandler(users.approveAdjustment));
r.post('/adjustments/:id/reject',        can('users.adjust'), asyncHandler(users.rejectAdjustment));
r.post('/users/:id/recalculate-team',    can('users.recalc'), asyncHandler(users.recalcTeam));
r.post('/users/:id/reset-password',       can('users.password'), asyncHandler(users.resetPassword));

/** Finance */
r.get('/deposits',                can('deposits.view'),       asyncHandler(finance.deposits));
r.post('/deposits/:id/confirm',   can('deposits.approve'),    idempotent, asyncHandler(finance.confirmDeposit));
r.post('/deposits/:id/reject',    can('deposits.reject'),     idempotent, asyncHandler(finance.rejectDeposit));
r.get('/withdrawals',             can('withdrawals.view'),    asyncHandler(finance.withdrawals));
r.post('/withdrawals/:id/approve',can('withdrawals.approve'), idempotent, asyncHandler(finance.approveWithdrawal));
r.post('/withdrawals/:id/reject', can('withdrawals.reject'),  idempotent, asyncHandler(finance.rejectWithdrawal));

/** Compensation plan */
r.get('/packages',                 can('plan.view'),      asyncHandler(catalog.packages));
r.post('/packages',                can('plan.edit'),      asyncHandler(catalog.upsertPackage));
r.get('/commission-rules',         can('plan.view'),      asyncHandler(catalog.commissionRules));
r.put('/commission-rules',         can('plan.edit'),      asyncHandler(catalog.updateCommissionRule));
r.put('/commission-rules/batch',   can('plan.edit'),      asyncHandler(catalog.updateCommissionRules));
r.get('/ranks',                    can('plan.view'),      asyncHandler(catalog.ranks));
r.patch('/ranks/:id',              can('plan.edit'),      asyncHandler(catalog.updateRank));
r.get('/rank-achievements',        can('plan.view'),      asyncHandler(catalog.rankAchievements));
r.get('/reward-tiers',    can('plan.view'), asyncHandler(catalog.rewardTiers));
r.post('/reward-tiers',   can('plan.edit'), asyncHandler(catalog.upsertRewardTier));
r.get('/roaming-tiers',            can('plan.view'),      asyncHandler(catalog.roamingTiers));
r.get('/roaming-awards',           can('plan.view'),      asyncHandler(catalog.roamingAwards));
r.post('/roaming-awards/:id/fulfil', can('roaming.fulfil'), asyncHandler(catalog.fulfilRoaming));

/** Ledger-derived views */
r.get('/transactions',  can('users.view'),      asyncHandler(ledger.transactions));
r.get('/commissions',   can('users.view'),      asyncHandler(ledger.commissions));
r.get('/investments',   can('users.view'),      asyncHandler(ledger.investments));
r.get('/wallet-summary',can('deposits.view'),   asyncHandler(ledger.walletSummary));
r.get('/network-levels',can('users.view'),      asyncHandler(ledger.networkLevels));
r.get('/network/genealogy', can('users.view'),  asyncHandler(ledger.genealogy));

/** Support desk */
r.get('/support',            can('support.view'),   asyncHandler(support.list));
r.get('/support/:id',        can('support.view'),   asyncHandler(support.detail));
r.post('/support/:id/reply', can('support.manage'), asyncHandler(support.reply));
r.patch('/support/:id/triage',   can('support.manage'), asyncHandler(support.triage));
r.post('/support/:id/claim',     can('support.manage'), asyncHandler(support.claim));
r.get('/support/attachments/:attachmentId', can('support.view'), asyncHandler(support.attachmentFile));
r.patch('/support/:id/status', can('support.manage'), asyncHandler(support.setStatus));

/** Compliance — identity verification */
r.get('/kyc',                    can('kyc.view'),   asyncHandler(kyc.list));
r.get('/kyc/:id',                can('kyc.view'),   asyncHandler(kyc.detail));
r.get('/kyc/documents/:docId',   can('kyc.view'),   asyncHandler(kyc.document));
r.post('/kyc/:id/approve',       can('kyc.review'), asyncHandler(kyc.approve));
r.post('/kyc/:id/reject',        can('kyc.review'), asyncHandler(kyc.reject));

/** CSV export — each resource checks the permission that guards its screen */
r.get('/export/:resource', asyncHandler(exporter.csv));

/** Notifications — same operations as the member console, different actor. */
r.use('/notifications', notificationRoutes());

/** Search across members, money and tickets. */
r.use('/search', searchRoutes());

/** Announcements — written by a human, sent to everyone. */
r.get('/announcements',             can('announcements.view'),   asyncHandler(announcements.list));
r.post('/announcements',            can('announcements.manage'), asyncHandler(announcements.upsert));
r.post('/announcements/:id/publish',can('announcements.send'),   idempotent, asyncHandler(announcements.publish));
r.post('/announcements/:id/withdraw',can('announcements.send'),  asyncHandler(announcements.withdraw));
r.delete('/announcements/:id',      can('announcements.manage'), asyncHandler(announcements.remove));

/** Prize draws. Running one pays out, so it is idempotency-guarded. */
r.get('/draws',            can('plan.view'),   asyncHandler(lottery.list));
r.post('/draws',           can('plan.edit'),   asyncHandler(lottery.upsert));
r.post('/draws/:id/open',  can('plan.edit'),   idempotent, asyncHandler(lottery.open));
r.post('/draws/:id/close', can('plan.edit'),   asyncHandler(lottery.close));
r.post('/draws/:id/run',   can('plan.edit'),   idempotent, asyncHandler(lottery.run));

/**
 * Dry run — models the plan against a synthetic member base.
 *
 * Gated on its own permission rather than on plan.edit: it writes hundreds of
 * members into the live database, which is a different kind of authority from
 * editing a package price.
 */
// ── faults ───────────────────────────────────────────────────────────────────
// Under the platform permission rather than a new one: whoever watches the
// queues is who needs to see that the platform is throwing.
r.get('/errors',              can('errors.view'),    asyncHandler(errors.list));
r.get('/errors/:id',          can('errors.view'),    asyncHandler(errors.detail));
r.post('/errors/:id/resolve', can('errors.resolve'), asyncHandler(errors.resolve));

r.get('/simulations',            can('simulation.run'), asyncHandler(simulation.list));
r.get('/simulations/defaults',   can('simulation.run'), asyncHandler(simulation.defaults));
r.get('/simulations/footprint',  can('simulation.run'), asyncHandler(simulation.footprint));
// Under the simulation permission, not plan.view: the picker is part of this
// tool, and an operator trusted to model the plan should not need the rights
// to edit it as well.
r.get('/simulations/packages',   can('simulation.run'), asyncHandler(simulation.packages));
r.get('/simulations/:id',        can('simulation.run'), asyncHandler(simulation.detail));
r.post('/simulations',           can('simulation.run'), idempotent, asyncHandler(simulation.start));
r.delete('/simulations/:id',     can('simulation.run'), asyncHandler(simulation.erase));

/** On-chain settlement */
r.get('/chain',                  can('jobs.view'), asyncHandler(chain.overview));
r.get('/chain/stuck',            can('jobs.view'), asyncHandler(chain.stuckPayouts));
r.post('/chain/scan',            can('jobs.run'),  idempotent, asyncHandler(chain.scanNow));
r.post('/chain/process-payouts', can('jobs.run'),  idempotent, asyncHandler(chain.processNow));

/** Payout engine */
r.get('/jobs',              can('jobs.view'), asyncHandler(jobs.overview));
r.post('/jobs/daily-roi/run', can('jobs.run'), idempotent, asyncHandler(jobs.runDailyRoi));

/** System */
r.get('/settings',      can('settings.view'), asyncHandler(settings.all));
r.put('/settings/:key', can('settings.edit'), asyncHandler(settings.set));
r.delete('/settings/:key', can('settings.edit'), asyncHandler(settings.reset));
r.get('/audit',         can('audit.view'),    asyncHandler(audit.list));
r.get('/audit/facets',  can('audit.view'),    asyncHandler(audit.facets));

/** Access control — roles and admin accounts */
r.get('/permissions',   can('roles.view'),    asyncHandler(rbac.catalogue));
r.get('/roles',         can('roles.view'),    asyncHandler(rbac.listRoles));
r.post('/roles',        can('roles.manage'),  asyncHandler(rbac.createRole));
r.patch('/roles/:id',   can('roles.manage'),  asyncHandler(rbac.updateRole));
r.delete('/roles/:id',  can('roles.manage'),  asyncHandler(rbac.deleteRole));
r.get('/admins',        can('admins.view'),   asyncHandler(rbac.listAdmins));
r.post('/admins',       can('admins.manage'), asyncHandler(rbac.createAdmin));
r.patch('/admins/:id',  can('admins.manage'), asyncHandler(rbac.updateAdmin));

export default r;
