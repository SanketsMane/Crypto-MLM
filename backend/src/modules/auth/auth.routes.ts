import { Router } from 'express';
import * as controller from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authLimiter } from '../../middleware/rate-limit.js';
import * as account from './account.controller.js';

const router = Router();
router.post('/register', authLimiter, asyncHandler(controller.register));
router.post('/login', authLimiter, asyncHandler(controller.login));

/** Public: confirms a referral code before someone commits to a placement. */
router.get('/sponsor/:code', authLimiter, asyncHandler(controller.lookupSponsor));
router.post('/refresh', authLimiter, asyncHandler(controller.refresh));
router.post('/logout', asyncHandler(controller.logout));

/** Second step of sign-in when two-factor is on. Rate limited like sign-in itself. */
router.post('/2fa/challenge', authLimiter, asyncHandler(controller.completeTwoFactor));

/** Password reset — reachable without a session, so limited as tightly as login. */
router.post('/forgot-password', authLimiter, asyncHandler(account.forgotPassword));
router.post('/reset-password', authLimiter, asyncHandler(account.resetPassword));

router.get('/me', requireAuth, asyncHandler(controller.me));
router.get('/sessions', requireAuth, asyncHandler(controller.sessions));
router.get('/activity', requireAuth, asyncHandler(controller.activity));
router.delete('/sessions/:id', requireAuth, asyncHandler(controller.endSession));
router.post('/logout-all', requireAuth, asyncHandler(controller.logoutEverywhere));
router.post('/change-password', requireAuth, asyncHandler(account.changePassword));

/** Re-authentication for money-moving actions. Limited like sign-in — it takes the same password. */
router.post('/step-up', requireAuth, authLimiter, asyncHandler(controller.stepUpIssue));

/** Email verification */
router.post('/verify-email/send', requireAuth, authLimiter, asyncHandler(account.sendVerification));
router.post('/verify-email/confirm', requireAuth, asyncHandler(account.confirmVerification));

/** Two-factor authentication */
router.get('/2fa', requireAuth, asyncHandler(account.twoFactorStatus));
router.post('/2fa/begin', requireAuth, asyncHandler(account.twoFactorBegin));
router.post('/2fa/confirm', requireAuth, asyncHandler(account.twoFactorConfirm));
router.post('/2fa/disable', requireAuth, asyncHandler(account.twoFactorDisable));
router.post('/2fa/recovery-codes', requireAuth, asyncHandler(account.twoFactorRegenerate));
export default router;
