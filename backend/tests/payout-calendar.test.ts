import { describe, expect, it } from 'vitest';
import { payoutDays, nextPayoutDate, payoutDueAt } from '../src/core/payout-calendar.js';

/**
 * The fortnightly settlement calendar.
 *
 * Two things here are easy to get wrong and expensive to get wrong: a payout
 * day that does not exist in the month, and the SLA clock. "The 30th" in
 * February is not a date; constructed naively it rolls into March and silently
 * reorders the calendar, so a member is told a payout date that arrives after
 * the following one. And if the SLA still ran from the request, every request
 * placed between payout dates would read as overdue while behaving exactly as
 * promised, burying real breaches.
 */

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe('parsing the operator setting', () => {
  it('reads a comma separated list', () => {
    expect(payoutDays('15,30')).toEqual([15, 30]);
  });

  it('sorts, dedupes and tolerates whitespace', () => {
    expect(payoutDays(' 30 , 15,15 ')).toEqual([15, 30]);
  });

  it('drops anything that is not a day of a month', () => {
    // A stray 0, 32 or word must not become a settlement date.
    expect(payoutDays('0,15,32,abc,30,-5')).toEqual([15, 30]);
  });

  it('treats empty as no calendar at all', () => {
    expect(payoutDays('')).toEqual([]);
    expect(payoutDays('   ')).toEqual([]);
  });
});

describe('finding the next settlement date', () => {
  it('returns null when no calendar is set, meaning settle continuously', () => {
    expect(nextPayoutDate([], utc(2026, 9, 3))).toBeNull();
  });

  it('picks the next day within the month', () => {
    expect(iso(nextPayoutDate([15, 30], utc(2026, 9, 3)))).toBe('2026-09-15');
    expect(iso(nextPayoutDate([15, 30], utc(2026, 9, 16)))).toBe('2026-09-30');
  });

  it('settles same-day on a payout date rather than waiting a fortnight', () => {
    expect(iso(nextPayoutDate([15, 30], utc(2026, 9, 15)))).toBe('2026-09-15');
    expect(iso(nextPayoutDate([15, 30], utc(2026, 9, 30)))).toBe('2026-09-30');
  });

  it('rolls into the following month once the last date has passed', () => {
    expect(iso(nextPayoutDate([15, 30], utc(2026, 9, 31)))).toBe('2026-10-15');
    expect(iso(nextPayoutDate([15, 30], utc(2026, 12, 31)))).toBe('2027-01-15');
  });
});

describe('a payout day the month does not have', () => {
  it('clamps the 30th to the last day of February', () => {
    // 2026 is not a leap year.
    expect(iso(nextPayoutDate([15, 30], utc(2026, 2, 16)))).toBe('2026-02-28');
  });

  it('clamps to the 29th in a leap year', () => {
    expect(iso(nextPayoutDate([15, 30], utc(2028, 2, 16)))).toBe('2028-02-29');
  });

  it('does not roll a clamped date into the next month', () => {
    /* The bug this guards: `new Date(2026, 1, 30)` is 2 March. That would put
       February's second payout AFTER a member expecting it in February, and
       ahead of nothing — the calendar silently loses a date. */
    const d = nextPayoutDate([15, 30], utc(2026, 2, 20))!;
    expect(d.getUTCMonth()).toBe(1); // still February
    expect(iso(d)).toBe('2026-02-28');
  });

  it('still settles on the 28th when asked on the 28th of February', () => {
    expect(iso(nextPayoutDate([15, 30], utc(2026, 2, 28)))).toBe('2026-02-28');
  });

  it('moves to March once February is exhausted', () => {
    expect(iso(nextPayoutDate([15, 30], utc(2026, 3, 1)))).toBe('2026-03-15');
  });
});

describe('the SLA clock', () => {
  it('runs from the settlement date, not the request', () => {
    const requested = utc(2026, 9, 1);
    const scheduled = utc(2026, 9, 15);
    // Not 3 September: the operator is not late until the batch is late.
    expect(iso(payoutDueAt(scheduled, requested, 48))).toBe('2026-09-17');
  });

  it('runs from the request when no calendar is configured', () => {
    const requested = utc(2026, 9, 1);
    expect(iso(payoutDueAt(null, requested, 48))).toBe('2026-09-03');
  });

  it('does not flag a request placed just after a payout as overdue', () => {
    const requested = utc(2026, 9, 16);
    const scheduled = nextPayoutDate([15, 30], requested)!;
    const due = payoutDueAt(scheduled, requested, 48);
    // Two weeks of waiting is the design, not a breach.
    expect(due.getTime()).toBeGreaterThan(utc(2026, 9, 30).getTime());
  });
});
