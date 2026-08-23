'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { ArrowRight, X } from 'lucide-react';
import { MEMBER_NAV } from './nav-config';

export function MemberSidebar({ collapsed, mobileOpen, onCloseMobile }: {
  collapsed: boolean; mobileOpen: boolean; onCloseMobile: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <div
        onClick={onCloseMobile}
        className={clsx('fixed inset-0 z-40 bg-navy/60 backdrop-blur-sm transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />

      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 flex flex-col bg-navy transition-[width,transform] duration-300 ease-out',
        'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
        collapsed ? 'w-[76px]' : 'w-[248px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className={clsx('flex h-[88px] shrink-0 items-center', collapsed ? 'justify-center px-2' : 'px-5')}>
          <Link href="/dashboard" onClick={onCloseMobile} aria-label="FortuneX"
                className={clsx('relative block', collapsed ? 'h-9 w-[52px]' : 'h-11 w-full max-w-[188px]')}>
            <Image src={collapsed ? '/brand/FX-mark.png' : '/brand/FX-wordmark.png'} alt="FortuneX" fill
                   sizes={collapsed ? '52px' : '188px'} priority
                   className={clsx('object-contain', collapsed ? 'object-center' : 'object-left')} />
          </Link>
          <button onClick={onCloseMobile} aria-label="Close menu"
                  className="ml-auto rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <nav className={clsx('nav-scroll h-full overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')}>
          {MEMBER_NAV.map((group) => (
            <div key={group.heading} className="mb-3">
              {!collapsed && (
                <p className="px-3 pb-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-white/55">
                  {group.heading}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <li key={href}>
                      <Link href={href} onClick={onCloseMobile} title={collapsed ? label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={clsx(
                          'group flex items-center rounded-[10px] text-[13.5px] transition-all duration-200',
                          collapsed ? 'h-10 justify-center' : 'h-10 gap-3 px-3',
                          active
                            ? 'bg-[linear-gradient(135deg,rgba(212,175,55,0.20)_0%,rgba(212,175,55,0.08)_100%)] font-semibold text-gold-hi ring-1 ring-gold-line/45'
                            : 'text-white/62 hover:bg-white/[0.07] hover:text-white',
                        )}>
                        <Icon size={18} strokeWidth={active ? 2.3 : 1.9} className="shrink-0" />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          </nav>
          {/* fades the last row rather than slicing it */}
          <span aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-sidebar to-transparent" />
        </div>

        {/* ── promo ──
            Moved here from the operations console, where it did not belong:
            an operator has no plan to upgrade. This is the audience the card
            was written for. */}
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
                className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0, 0, 0,0.94)_0%,rgba(0, 0, 0,0.86)_38%,rgba(0, 0, 0,0.45)_72%,rgba(0, 0, 0,0.12)_100%)]"
              />

              <div className="relative">
                <p className="text-[14px] font-bold leading-tight text-white sm:text-[15px]">
                  Trade. Invest. Earn.
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/60 sm:text-[11.5px] [@media(max-height:760px)]:hidden">
                  Empower your network and grow your wealth with smart trading.
                </p>
                {/* The one thing that could not carry across unchanged: the
                    console version pointed at /admin/plans, which a member
                    cannot reach. For them, upgrading a plan means buying a
                    package. */}
                <Link
                  href="/packages"
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
