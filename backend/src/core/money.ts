import { Decimal } from 'decimal.js';

// Money is never a float. 8dp everywhere, matching Decimal(38,8) in Postgres.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN, toExpNeg: -20, toExpPos: 40 });

export type Money = Decimal;
export const SCALE = 8;

export const money = (v: Decimal.Value): Money => new Decimal(v ?? 0);
export const zero = (): Money => new Decimal(0);

/// Percentages always round DOWN so the platform never over-pays by a rounding cent.
export const percentOf = (base: Decimal.Value, percent: Decimal.Value): Money =>
  new Decimal(base).mul(new Decimal(percent)).div(100).toDecimalPlaces(SCALE, Decimal.ROUND_DOWN);

export const clampToRemaining = (amount: Decimal.Value, remaining: Decimal.Value): Money => {
  const a = new Decimal(amount);
  const r = new Decimal(remaining);
  if (r.lte(0)) return new Decimal(0);
  return a.gt(r) ? r : a;
};

export const toDb = (v: Decimal.Value): string =>
  new Decimal(v).toDecimalPlaces(SCALE, Decimal.ROUND_DOWN).toFixed(SCALE);

export const isPositive = (v: Decimal.Value): boolean => new Decimal(v).gt(0);
