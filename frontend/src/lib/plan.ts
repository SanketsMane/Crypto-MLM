/**
 * The compensation plan, as published.
 *
 * Every figure on the public site reads from here, and every figure here
 * matches what the platform actually enforces (see the backend seed and
 * `core/runtime-config.ts`). A marketing page that drifts from the engine is
 * how a business ends up promising something it does not pay.
 */

export const PACKAGES = [110, 270, 530, 1_100, 2_650, 5_300, 10_500, 26_100, 52_200, 104_300] as const;

export const DAILY_RETURN_PERCENT = 0.5;
export const TRADING_DAYS = 'Monday to Friday';
export const CAP_PASSIVE_PERCENT = 250;
export const CAP_ACTIVE_PERCENT = 300;

export const WITHDRAW = {
  feePercent: 5,
  min: 10,
  max: 5_000,
  slaHours: 48,
  network: 'USDT · BEP-20',
} as const;

/** Direct sponsor bonus — 5% of a referred purchase, split across three levels. */
export const DIRECT_BONUS = [
  { level: 1, percent: 4 },
  { level: 2, percent: 0.5 },
  { level: 3, percent: 0.5 },
] as const;

/** Generation bonus — paid on the daily trade bonus of your network, 30 levels deep. */
export const GENERATION_BANDS = [
  { levels: '1', percent: 13, directs: 0, volume: 0 },
  { levels: '2', percent: 8, directs: 2, volume: 1_000 },
  { levels: '3 – 5', percent: 5, directs: 6, volume: 6_000 },
  { levels: '6 – 10', percent: 2, directs: 8, volume: 12_000 },
  { levels: '11 – 20', percent: 1, directs: 15, volume: 30_000 },
  { levels: '21 – 30', percent: 0.5, directs: 18, volume: 60_000 },
] as const;

export const RANKS = [
  { name: 'Starter', self: 300, team: 5_000, reward: 300 },
  { name: 'Silver', self: 500, team: 25_000, reward: 1_000 },
  { name: 'Bronze', self: 1_000, team: 75_000, reward: 2_000 },
  { name: 'Gold', self: 1_500, team: 150_000, reward: 5_000 },
  { name: 'Platinum', self: 2_000, team: 250_000, reward: 7_500 },
  { name: 'Diamond', self: 2_500, team: 500_000, reward: 15_000 },
  { name: 'Elite', self: 3_000, team: 750_000, reward: 30_000 },
  { name: 'Master', self: 5_000, team: 1_500_000, reward: 75_000 },
  { name: 'Champion', self: 7_500, team: 3_000_000, reward: 150_000 },
  { name: 'Legend', self: 10_000, team: 5_000_000, reward: 250_000 },
] as const;

export const ROAMING = {
  affiliate: [
    { destination: 'Thailand', self: 500, team: 3_000 },
    { destination: 'Malaysia', self: 1_000, team: 6_000 },
    { destination: 'Dubai', self: 2_000, team: 9_000 },
    { destination: 'Singapore', self: 3_000, team: 12_000 },
    { destination: 'Europe', self: 5_000, team: 15_000 },
  ],
  selfCapitalist: [
    { destination: 'Thailand', self: 5_000 },
    { destination: 'Malaysia', self: 7_500 },
    { destination: 'Dubai', self: 10_000 },
    { destination: 'Singapore', self: 15_000 },
    { destination: 'Europe', self: 25_000 },
  ],
} as const;

/** Compact money for display: $1,100 · $104.3K · $5M */
export function planMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return `$${n.toLocaleString('en-US')}`;
}
