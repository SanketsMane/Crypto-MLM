'use client';

import Link from 'next/link';
import { BadgeCheck, Banknote, CandlestickChart, PackagePlus, Settings, UserPlus } from 'lucide-react';
import { Card, CardHead } from '@/components/ui/primitives';

const ACTIONS = [
  { label: 'Add New User',   href: '/admin/users',       Icon: UserPlus },
  { label: 'Create Plan',    href: '/admin/plans',       Icon: PackagePlus },
  { label: 'Manage Trades',  href: '/admin/investments', Icon: CandlestickChart },
  { label: 'Approve KYC',    href: '/admin/kyc',         Icon: BadgeCheck },
  { label: 'Process Payout', href: '/admin/payouts',     Icon: Banknote },
  { label: 'System Settings',href: '/admin/settings',    Icon: Settings },
];

export function QuickActions({ className }: { className?: string }) {
  return (
    <Card className={`flex h-full flex-col ${className ?? ''}`}>
      <CardHead title="Quick Actions" />
      <div className="grid flex-1 grid-cols-2 gap-2.5 px-5 pb-5 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
        {ACTIONS.map(({ label, href, Icon }) => (
          <Link key={label} href={href}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-card px-2 py-3.5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-violet/30 hover:bg-violet-soft/40 hover:shadow-[0_8px_20px_-10px_rgba(96,70,232,0.4)]">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-soft text-violet transition group-hover:bg-violet group-hover:text-white">
              <Icon size={17} strokeWidth={2} />
            </span>
            <span className="text-[11.5px] font-medium leading-tight text-ink-2 group-hover:text-ink">{label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
