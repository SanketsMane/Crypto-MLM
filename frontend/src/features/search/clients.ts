'use client';

import { get } from '@/lib/api';
import { adminGet } from '@/lib/admin-api';
import type { SearchClient } from './command-palette';

export const memberSearch: SearchClient = {
  get, base: '/search', scope: 'member',
  placeholder: 'Search packages, income, team…',
};

export const adminSearch: SearchClient = {
  get: adminGet, base: '/admin/search', scope: 'admin',
  placeholder: 'Search members, transactions, tickets…',
};
