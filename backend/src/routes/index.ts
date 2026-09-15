import { Router } from 'express';
import auth from '../modules/auth/auth.routes.js';
import customer from '../modules/customer/customer.routes.js';
import wallet from '../modules/wallet/wallet.routes.js';
import deposit from '../modules/deposit/deposit.routes.js';
import withdrawal from '../modules/withdrawal/withdrawal.routes.js';
import pkg from '../modules/package/package.routes.js';
import investment from '../modules/investment/investment.routes.js';
import rank from '../modules/rank/rank.routes.js';
import roamingClub from '../modules/roaming-club/roaming-club.routes.js';
import team from '../modules/team/team.routes.js';
import income from '../modules/income/income.routes.js';
import support from '../modules/support/support.routes.js';
import kyc from '../modules/kyc/kyc.routes.js';
import contact from '../modules/contact/contact.routes.js';
import gateway from '../modules/gateway/gateway.routes.js';
import admin from '../modules/admin/admin.routes.js';
import { notificationRoutes } from '../modules/notification/notification.routes.js';
import { searchRoutes } from '../modules/search/search.routes.js';
import * as announcement from '../modules/announcement/announcement.controller.js';
import * as privacy from '../modules/privacy/privacy.controller.js';
import * as platformConfig from '../modules/config/config.controller.js';
import * as branding from '../modules/branding/branding.controller.js';
import rewards from '../modules/rewards/rewards.routes.js';
import lottery from '../modules/lottery/lottery.routes.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * The published plan, as enforced. Read by the member app and the public site
 * so neither can drift from what the engine actually does.
 */
router.get('/config', asyncHandler(platformConfig.publicConfig));

/**
 * The operator's brand. Public and unauthenticated, because the login page and
 * the public site render the logo before anyone has a session.
 *
 * `/brand/asset/:key` is the only route in the API that serves stored bytes to
 * an anonymous caller — deliberately, and only for artwork whose key is a hash
 * of its own contents. KYC documents stay behind the authenticated admin
 * stream in `core/document-storage.ts`; the two must not be confused.
 */
router.get('/brand', asyncHandler(branding.publicBranding));
router.get('/brand/asset/:key', asyncHandler(branding.asset));

// Health probes are mounted in app.ts, ahead of the rate limiter — see there.

router.use('/auth', auth);
router.use('/customer', customer);
router.use('/wallet', wallet);
router.use('/deposits', deposit);
router.use('/withdrawals', withdrawal);
router.use('/packages', pkg);
router.use('/investments', investment);
router.use('/rank', rank);
router.use('/roaming-club', roamingClub);
router.use('/rewards', rewards);
router.use('/draws', lottery);
router.use('/team', team);
router.use('/income', income);
router.use('/support', support);
router.use('/kyc', kyc);
router.use('/contact', contact);
router.use('/gateway', gateway);
router.use('/notifications', requireAuth, notificationRoutes());
router.use('/search', requireAuth, searchRoutes());

/** Pinned operator notices, and dismissing them. */
router.get('/announcements', requireAuth, asyncHandler(announcement.banners));
router.post('/announcements/:id/dismiss', requireAuth, asyncHandler(announcement.dismiss));

/** What the member agreed to, and a copy of everything we hold on them. */
router.get('/privacy/consents', requireAuth, asyncHandler(privacy.consents));
router.post('/privacy/consents', requireAuth, asyncHandler(privacy.accept));
router.get('/privacy/export', requireAuth, asyncHandler(privacy.exportData));
router.use('/admin', admin);

export default router;
