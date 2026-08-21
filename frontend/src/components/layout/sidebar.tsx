'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { ArrowRight, X } from 'lucide-react';
import { NAV } from './nav-config';
import { useAdmin } from '@/features/admin/use-admin';

interface Props {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: Props) {
  const pathname = usePathname();
  const { can } = useAdmin();
  const items = NAV.filter((i) => !i.perm || can(i.perm));

  return (
    <>
      {/* mobile scrim */}
      <div
        onClick={onCloseMobile}
        className={clsx(
          'fixed inset-0 z-40 bg-navy/60 backdrop-blur-sm transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar transition-[width,transform] duration-300 ease-out',
          'border-r border-sidebar-line',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          collapsed ? 'w-[76px]' : 'w-[248px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* ── brand ── */}
        <div className={clsx('flex h-[88px] shrink-0 items-center', collapsed ? 'justify-center px-2' : 'px-5')}>
          <Link href="/admin" onClick={onCloseMobile} aria-label="FortuneX"
                className={clsx('relative block', collapsed ? 'h-9 w-[52px]' : 'h-11 w-full max-w-[188px]')}>
            <Image
              /* the mark is trimmed to its artwork, so object-contain fills the
                 rail without dead margin; alpha means no blend mode is needed */
              src={collapsed ? '/brand/FX-mark.png' : '/brand/FX-wordmark.png'}
              alt="FortuneX"
              fill
              sizes={collapsed ? '52px' : '188px'}
              priority
              className={clsx('object-contain', collapsed ? 'object-center' : 'object-left')}
            />
          </Link>
          <button onClick={onCloseMobile} aria-label="Close menu"
                  className="ml-auto rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        </div>

        {/* ── navigation ── */}
        <nav className={clsx('flex-1 overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')}>
          <ul className="space-y-1">
            {items.map(({ href, label, icon: Icon, pending }) => {
              const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onCloseMobile}
                    title={collapsed ? label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'group relative flex items-center rounded-[10px] text-[13.5px] transition-all duration-200',
                      collapsed ? 'h-11 justify-center' : 'h-11 gap-3 px-3',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
                      active
                        ? 'bg-[linear-gradient(135deg,rgba(212,175,55,0.20)_0%,rgba(212,175,55,0.08)_100%)] font-semibold text-gold-hi ring-1 ring-gold-line/45'
                        : 'text-white/62 hover:bg-white/[0.07] hover:text-white',
                    )}
                  >
                    {active && (
                      <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-hi" />
                    )}
                    <Icon size={18} strokeWidth={active ? 2.3 : 1.9} className="shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="truncate">{label}</span>
                        {pending && (
                          <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/50">
                            soon
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── promo ── */}
        {!collapsed && (
          <div className="shrink-0 px-3 pb-4">
            <div
              className={clsx(
                'group relative isolate flex w-full flex-col overflow-hidden rounded-2xl',
                'bg-navy-card p-3.5 ring-1 ring-gold-line/45 sm:p-4',
                'min-h-[190px] sm:min-h-[210px] [@media(max-height:760px)]:min-h-[148px]',
                'shadow-[0_12px_28px_-14px_rgba(0,0,0,0.85)]',
              )}
            >
              {/* background artwork */}
              <Image
                src="/brand/sidebar-promo.png"
                alt=""
                aria-hidden
                fill
                sizes="248px"
                className="-z-10 select-none object-cover object-[62%_100%] transition-transform duration-500 group-hover:scale-[1.06]"
              />

              {/* legibility overlay — dark where the copy sits, clear over the artwork */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(7,20,38,0.94)_0%,rgba(7,20,38,0.86)_38%,rgba(7,20,38,0.45)_72%,rgba(7,20,38,0.12)_100%)]"
              />

              <div className="relative">
                <p className="text-[14px] font-bold leading-tight text-white sm:text-[15px]">
                  Trade. Invest. Earn.
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/60 sm:text-[11.5px] [@media(max-height:760px)]:hidden">
                  Empower your network and grow your wealth with smart trading.
                </p>
                <Link
                  href="/admin/plans"
                  onClick={onCloseMobile}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,#D4AF37_0%,#C49A2C_100%)] px-3 py-2 text-[11.5px] font-semibold text-navy shadow-[0_6px_16px_-6px_rgba(212,175,55,0.65)] transition hover:brightness-110 sm:text-[12px]"
                >
                  Upgrade Your Plan
                  <ArrowRight size={13} className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

      </aside>
    </>
  );
}
