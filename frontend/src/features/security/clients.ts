'use client';

import { get, post } from '@/lib/api';
import { adminGet, adminPost } from '@/lib/admin-api';

/**
 * The two consoles use different tokens and different sign-out behaviour, but
 * the same two-factor API. Naming the difference here keeps one component
 * serving both.
 */
export const memberTwoFactor = { get, post, base: '/auth/2fa', scope: 'member' };
export const adminTwoFactor = { get: adminGet, post: adminPost, base: '/admin/2fa', scope: 'admin' };
