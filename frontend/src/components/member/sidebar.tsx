'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { ArrowRight, X } from 'lucide-react';
import { MEMBER_NAV } from './nav-config';
import { BrandMark } from '@/components/layout/brand-mark';
import { useBrandName } from '@/providers/brand-provider';

export function MemberSidebar({ collapsed, mobileOpen, onCloseMobile }: {
  collapsed: boolean; mobileOpen: boolean; onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const brandLabel = useBrandName();

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
        collapsed ? 'w-[60px]' : 'w-[208px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className={clsx('flex h-[52px] shrink-0 items-center border-b border-sidebar-line', collapsed ? 'justify-center px-2' : 'px-4')}>
          {/* The operator's mark, not a baked-in one. See components/layout/brand-mark. */}
          <Link href="/dashboard" onClick={onCloseMobile} aria-label={brandLabel}
                className={clsx('block min-w-0', collapsed ? 'w-auto' : 'w-full max-w-[150px]')}>
            <BrandMark variant={collapsed ? 'mark' : 'full'} surface="dark" ink="onDark" />
          </Link>
          <button onClick={onCloseMobile} aria-label="Close menu"
                  className="ml-auto rounded-[4px] p-1.5 text-white/50 hover:bg-white/10 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <nav className={clsx('nav-scroll h-full overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')}>
          {MEMBER_NAV.map((group) => (
            <div key={group.heading} className="mb-3">
              {!collapsed && (
                <p className="px-2.5 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.11em] text-white/40">
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
                          'group relative flex items-center rounded-[3px] text-[12.5px] transition-colors duration-140',
                          collapsed ? 'h-[30px] justify-center' : 'h-[30px] gap-2.5 px-2.5',
                          active
                            ? 'bg-white/[0.06] font-semibold text-white shadow-[inset_2px_0_0_var(--color-gold)]'
                            : 'text-white/55 hover:bg-white/[0.045] hover:text-white',
                        )}>
                        <Icon size={15} strokeWidth={active ? 2.2 : 1.9} className="shrink-0" />
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
                'group relative isolate flex w-full flex-col overflow-hidden rounded-[4px]',
                'bg-white/[0.03] p-3 ring-1 ring-white/[0.07]',
                /* Sized to its copy now that there is no artwork to give a
                   200px-tall panel something to show. */
                '[@media(max-height:760px)]:hidden',
              )}
            >
              {/* The artwork and its legibility scrim are both gone.

                  This panel carried a gold promotional render with a
                  near-opaque black gradient stacked on top so the copy stayed
                  readable — an image mostly hidden by the fix for the image.
                  It was also the last piece of the old gold identity visible
                  on every single member screen. The panel now carries its
                  message and nothing else. */}

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
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-gold px-3 py-2 text-[11.5px] font-semibold text-gold-on transition hover:bg-gold-hover sm:text-[12px]"
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
