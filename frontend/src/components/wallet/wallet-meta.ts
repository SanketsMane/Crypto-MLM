import { ArrowDownToLine, Landmark, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The three wallets, described once.
 *
 * Order, copy, icon and accent all live here so the summary cards and the
 * transfer selectors cannot disagree about what a wallet is called or what
 * colour it wears. The wallet *types* themselves still come from the API —
 * this only decorates what the server returns.
 */
export interface WalletMeta {
  label: string;
  role: string;
  icon: LucideIcon;
  /** The wallet's identifying colour — a chart token, validated for contrast and CVD. */
  accent: string;
}

export const WALLET_META: Record<string, WalletMeta> = {
  MAIN:    { label: 'Main wallet',    role: 'Income and withdrawals',        icon: Wallet,          accent: 'var(--color-gold)' },
  FUND:    { label: 'Fund wallet',    role: 'Deposits and package purchases', icon: ArrowDownToLine, accent: 'var(--color-chart-1)' },
  DIGITAL: { label: 'Digital wallet', role: 'Digital assets',                icon: Landmark,        accent: 'var(--color-chart-3)' },
};

const ORDER = ['MAIN', 'FUND', 'DIGITAL'];

/** Main, Fund, Digital — with anything unrecognised kept, not dropped. */
export const byWalletOrder = <T extends { type: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const ia = ORDER.indexOf(a.type), ib = ORDER.indexOf(b.type);
    return (ia < 0 ? ORDER.length : ia) - (ib < 0 ? ORDER.length : ib);
  });

export const metaFor = (type: string): WalletMeta =>
  WALLET_META[type] ?? { label: `${type} wallet`, role: '', icon: Wallet, accent: 'var(--color-ink-3)' };
