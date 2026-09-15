/**
 * When an approved withdrawal is actually settled.
 *
 * The terms say two things that look contradictory: withdrawals "can be placed
 * 24/7 and are processed within 48 hours", and "all withdrawals every
 * fortnight (15th and 30th of every month)". They are not in conflict once you
 * separate the two events. A member may REQUEST at any hour; the platform
 * SETTLES on the payout dates. The 48 hours is the operator's window to get a
 * scheduled batch out, not a promise to pay within 48 hours of the request.
 *
 * Encoding that distinction matters for more than copy. `slaDueAt` drives the
 * overdue flag on the payouts queue; if it stayed at request + 48h, every
 * request placed on the 1st would sit there screaming overdue for a fortnight
 * while behaving exactly as designed, and a real breach would be invisible in
 * the noise. So the clock starts at the scheduled date, not at the request.
 *
 * An empty day list means no calendar: settlement is continuous and the SLA
 * runs from the request, which is how the platform behaved before this module
 * existed.
 */

/** Parse the operator's setting into sorted, unique days of the month. */
export function payoutDays(raw: string): number[] {
  return [...new Set(
    raw.split(',')
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 31),
  )].sort((a, b) => a - b);
}

const lastDayOf = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/**
 * A payout day, clamped into a month that may not contain it.
 *
 * "The 30th" has no meaning in February, and a naive `new Date(y, 1, 30)`
 * rolls forward into March — which would silently move that month's payout
 * past the one after it and reorder the calendar. February pays on the 28th
 * (29th in a leap year) instead, which is what "the 30th" can only sensibly
 * mean in a month that ends sooner.
 */
const clampedDay = (year: number, monthIndex: number, day: number) =>
  Math.min(day, lastDayOf(year, monthIndex));

/**
 * The next settlement date at or after `from`.
 *
 * Dates are handled in UTC and returned at midnight UTC, matching the `@db.Date`
 * column they are stored in — a local-time construction here would shift the
 * date by one for anyone west of Greenwich.
 *
 * Returns null when no calendar is configured, meaning "settle continuously".
 */
export function nextPayoutDate(days: number[], from: Date = new Date()): Date | null {
  if (days.length === 0) return null;

  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const today = from.getUTCDate();

  // This month, then next — one rollover is always enough, because every month
  // contains at least one clamped payout day.
  for (const offset of [0, 1]) {
    const probeYear = year + Math.floor((month + offset) / 12);
    const probeMonth = (month + offset) % 12;

    for (const day of days) {
      const actual = clampedDay(probeYear, probeMonth, day);
      // `>=` so a request placed on a payout day settles that same day rather
      // than waiting a fortnight for the next one.
      if (offset > 0 || actual >= today) {
        return new Date(Date.UTC(probeYear, probeMonth, actual));
      }
    }
  }

  /* Unreachable: the loop above always returns on the second pass. Kept so the
     function is total rather than relying on that reasoning holding forever. */
  return null;
}

/**
 * When an operator has failed to settle, given the schedule.
 *
 * With a calendar the clock starts at the scheduled date; without one it starts
 * at the request, exactly as before.
 */
export function payoutDueAt(scheduledFor: Date | null, requestedAt: Date, slaHours: number): Date {
  const base = scheduledFor ?? requestedAt;
  return new Date(base.getTime() + slaHours * 60 * 60 * 1000);
}

/** Human wording for the member: "30 September 2026". */
export const formatPayoutDate = (d: Date): string =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
