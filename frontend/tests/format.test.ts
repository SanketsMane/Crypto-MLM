import { describe, expect, it } from 'vitest';
import { usd, usdWhole, num, pct, ago, titleCase, shortDate, UNKNOWN } from '@/lib/format';

/**
 * Formatting money.
 *
 * These functions decide what a member reads as their balance. Every value
 * arrives as a string, because the API stores money as `Decimal(38,8)` and
 * serialises it that way rather than risking a float — so everything here is
 * really about what happens between that string and the screen.
 *
 * The failure worth guarding against is not a wrong currency symbol. It is a
 * figure that is confidently wrong, or the literal text "$NaN" appearing where
 * somebody expects to see their money.
 */

describe('money', () => {
  it('formats a decimal string from the API', () => {
    expect(usd('1234.5')).toBe('$1,234.50');
    expect(usd('0')).toBe('$0.00');
    expect(usd('0.01')).toBe('$0.01');
  });

  it('treats a missing value as zero rather than as nothing', () => {
    // A member with no balance yet must see $0.00, not a blank space that
    // reads as "we do not know".
    expect(usd(null)).toBe('$0.00');
    expect(usd(undefined)).toBe('$0.00');
  });

  it('shows negatives as negative', () => {
    // Adjustments and reversals are real; a minus sign that goes missing turns
    // a deduction into a credit on screen.
    expect(usd('-50')).toBe('-$50.00');
  });

  it('never renders NaN to a member', () => {
    /**
     * The one that actually matters. Anything unparseable reaching this — a
     * malformed API response, a field that was renamed — must not put "$NaN"
     * on a page reporting somebody's money.
     */
    for (const bad of ['abc', 'null', '--1', {} as unknown as string, NaN, Infinity]) {
      for (const out of [usd(bad), usdWhole(bad), num(bad), pct(bad)]) {
        expect(out).not.toContain('NaN');
        expect(out).toBe(UNKNOWN);
      }
    }
  });

  it('tells a broken value apart from an absent one', () => {
    // Absent means zero — a member who has not deposited yet. Broken means we
    // could not read it, and saying "$0.00" there would report their money as
    // gone.
    expect(usd(null)).toBe('$0.00');
    expect(usd('')).toBe('$0.00');
    expect(usd('abc')).toBe(UNKNOWN);
  });

  it('does not render an unreadable date as "Invalid Date"', () => {
    expect(shortDate('not-a-date')).toBe(UNKNOWN);
    expect(ago('not-a-date')).toBe(UNKNOWN);
  });

  it('keeps the full precision the API sends, to two places', () => {
    expect(usd('999999.99')).toBe('$999,999.99');
    expect(usd('1000000')).toBe('$1,000,000.00');
  });

  it('drops the cents only where it says it does', () => {
    expect(usdWhole('2431850.77')).toBe('$2,431,851');
    expect(usdWhole('0')).toBe('$0');
  });

  it('honours an explicit precision', () => {
    expect(usd('1.005', 3)).toBe('$1.005');
    expect(usd('1234', 0)).toBe('$1,234');
  });
});

describe('counts and rates', () => {
  it('groups thousands', () => {
    expect(num(1546)).toBe('1,546');
    expect(num('1000000')).toBe('1,000,000');
    expect(num(null)).toBe('0');
  });

  it('renders a rate at one decimal by default', () => {
    expect(pct(0.5)).toBe('0.5%');
    expect(pct(250)).toBe('250.0%');
    expect(pct(0.5, 2)).toBe('0.50%');
  });
});

describe('dates', () => {
  it('formats unambiguously — a month name, never 03/04', () => {
    // 03/04 is two different days depending on where the reader is. A platform
    // with members in more than one country cannot use it for a payout date.
    expect(shortDate('2026-08-23T10:00:00.000Z')).toMatch(/23 Aug 2026/);
  });

  it('counts elapsed time in the largest sensible unit', () => {
    const at = (ms: number) => ago(new Date(Date.now() - ms));

    expect(at(5_000)).toBe('5 secs ago');
    expect(at(1_000)).toBe('1 sec ago');
    expect(at(60_000)).toBe('1 min ago');
    expect(at(3_600_000)).toBe('1 hour ago');
    expect(at(86_400_000)).toBe('1 day ago');
  });

  it('gives up on "ago" past a month and shows the date', () => {
    expect(ago(new Date(Date.now() - 60 * 86_400_000))).toMatch(/\d{2} \w{3} \d{4}/);
  });

  it('never reports a future timestamp as a negative age', () => {
    // Clock skew between a member's device and the server is routine, and
    // "-3 secs ago" reads as a bug in the platform.
    expect(ago(new Date(Date.now() + 10_000))).not.toContain('-');
  });
});

describe('labels', () => {
  it('turns an enum into something readable', () => {
    expect(titleCase('DIRECT_BONUS')).toBe('Direct Bonus');
    expect(titleCase('PENDING')).toBe('Pending');
    expect(titleCase('ACTIVE')).toBe('Active');
  });
});
