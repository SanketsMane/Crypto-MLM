'use client';

import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { DEPLOY_DEFAULTS, type PlatformConfig } from '@/lib/platform-config';

export { DEPLOY_DEFAULTS };
export type { PlatformConfig };

/**
 * What the platform is actually set to.
 *
 * Every figure a member is shown — the withdrawal fee, the minimum, the
 * processing window, the earnings ceiling — used to be a constant in the
 * frontend that duplicated the settings table. Change the fee in the console
 * and the member's own form kept quoting the old one, then the server charged
 * the new one. This is the fix: one source, read from the same config the money
 * paths read.
 *
 * `placeholderData` is the deployed default rather than nothing, so a page
 * renders real numbers on first paint instead of dashes that shift a moment
 * later. It is replaced the instant the real values arrive.
 */
export function usePlatformConfig() {
  return useQuery<PlatformConfig>({
    queryKey: ['platform-config'],
    queryFn: () => get('/config'),
    // Changes rarely, read by nearly every page.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: DEPLOY_DEFAULTS,
  });
}

/** The withdrawal terms alone — the most-read slice. */
export function useWithdrawalTerms() {
  const { data } = usePlatformConfig();
  return data?.withdrawal ?? DEPLOY_DEFAULTS.withdrawal;
}
