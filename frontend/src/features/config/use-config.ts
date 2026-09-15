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

/**
 * When a member will actually be paid, in words.
 *
 * One helper rather than a sentence written out at each of the four places
 * that need it. Those sentences all said "within 48 hours", which stopped
 * being true the moment settlement moved to a fortnightly calendar — and four
 * copies of a promise is four places for it to drift from what the engine does.
 *
 * Reads the date the server computed. Deriving "the next 15th or 30th" here
 * would put a second implementation of the calendar in the browser, in local
 * time, disagreeing with the server for anyone whose clock is a day off.
 */
export function payoutTiming(w: PlatformConfig['withdrawal']): string {
  if (w.payoutDays.length === 0) return `usually within ${w.slaHours} hours`;
  if (!w.nextPayoutDate) return 'on the next scheduled payout date';

  const when = new Date(`${w.nextPayoutDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  });
  return `on ${when}, the next scheduled payout date`;
}

/** "the 15th and 30th of each month" — for explaining the schedule itself. */
export function payoutScheduleLabel(w: PlatformConfig['withdrawal']): string | null {
  if (w.payoutDays.length === 0) return null;
  const ordinal = (n: number) => {
    // 11th, 12th, 13th are the exceptions — they do not follow their last digit.
    const teen = n % 100;
    if (teen >= 11 && teen <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  };
  const days = w.payoutDays.map(ordinal);
  const list = days.length === 1 ? days[0]
    : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
  return `the ${list} of each month`;
}
