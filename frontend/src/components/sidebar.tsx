'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Package, TrendingUp, Wallet, Users, Network,
  Trophy, Plane, ArrowDownToLine, LifeBuoy, User, LogOut, ShieldCheck } from 'lucide-react';
import { useLogout } from '@/features/auth/use-auth';

const NAV = [
  { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/packages',     label: 'Packages',     icon: Package },
  { href: '/income',       label: 'Income',       icon: TrendingUp },
  { href: '/wallet',       label: 'Wallet',       icon: Wallet },
  { href: '/team',         label: 'Team',         icon: Users },
  { href: '/genealogy',    label: 'Genealogy',    icon: Network },
  { href: '/rank',         label: 'Rank',         icon: Trophy },
  { href: '/flyers-club', label: 'Flyers Club', icon: Plane },
  { href: '/withdrawals',  label: 'Withdrawals',  icon: ArrowDownToLine },
  { href: '/support',      label: 'Support',      icon: LifeBuoy },
  { href: '/kyc',          label: 'Verification', icon: ShieldCheck },
  { href: '/profile',      label: 'Profile',      icon: User },
];

/** Customer sidebar — same brand language as the admin console. */
export function Sidebar() {
  const pathname = usePathname();
  const logout = useLogout();

  return (
    <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col bg-navy">
      <div className="flex h-[88px] items-center px-5">
        <Link href="/dashboard" className="relative block h-11 w-full max-w-[188px]">
          <Image src="/brand/FX-wordmark.png" alt="FortuneX" fill sizes="188px" priority
                 className="object-contain object-left" />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              className={clsx('flex h-11 items-center gap-3 rounded-[10px] px-3 text-[13.5px] transition',
                active
                  ? 'bg-[linear-gradient(135deg,#D4AF37_0%,#C49A2C_100%)] font-semibold text-navy'
                  : 'text-white/62 hover:bg-white/[0.07] hover:text-white')}>
              <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
              {label}
            </Link>
          );
        })}
      </nav>

      <button onClick={logout}
        className="m-3 flex h-11 items-center gap-3 rounded-[10px] px-3 text-[13.5px] text-white/55 transition hover:bg-white/[0.07] hover:text-white">
        <LogOut size={18} /> Sign out
      </button>
    </aside>
  );
}
