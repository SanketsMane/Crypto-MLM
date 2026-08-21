'use client';

import { get, post, patch } from '@/lib/api';
import { adminGet, adminPost, adminPatch } from '@/lib/admin-api';
import type { Transport } from './use-notifications';

/**
 * The two consoles use different clients — different tokens, different refresh
 * behaviour, different login redirect — but the same notification API. Naming
 * that difference here keeps one bell component serving both.
 */

export const memberTransport: Transport = {
  get, post, patch,
  base: '/notifications',
  scope: 'member',
};

export const adminTransport: Transport = {
  get: adminGet,
  post: adminPost,
  patch: adminPatch,
  base: '/admin/notifications',
  scope: 'admin',
};
