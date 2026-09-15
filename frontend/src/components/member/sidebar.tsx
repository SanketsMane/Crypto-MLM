'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { MEMBER_NAV } from './nav-config';
import { BrandMark } from '@/components/layout/brand-mark';
import { useBrandName } from '@/providers/brand-provider';

/**
 * The member's nav.
 *
 * Twenty-one destinations in five groups. The constraint that shapes this is
 * that all twenty-one have to be reachable without scrolling on a 900px
 * screen, because the five that did not fit were the whole Account group —
 * Profile, Notifications, Security and Support — and a member looking for
 * "change my password" does not think to scroll a navigation column.
 *
 * What was taking that space was a promotional panel: a heading, two lines of
 * copy and an "Upgrade Your Plan" button pointing at /packages, which is the
 * nav item sitting four rows above it. It cost roughly 150px and one nav
 * group to repeat a link the member already had. It is gone.
 *
 * The rows are 28px on a 2px rhythm, which is what makes the rest fit. The
 * scroll fade stays for genuinely short viewports, where something has to
 * give.
 */
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
          <nav className={clsx('nav-scroll h-full overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3')}>
          {MEMBER_NAV.map((group) => (
            <div key={group.heading} className="mb-2.5 last:mb-0">
              {!collapsed && (
                <p className="px-2.5 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.11em] text-white/35">
                  {group.heading}
                </p>
              )}
              <ul className="space-y-[2px]">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <li key={href}>
                      <Link href={href} onClick={onCloseMobile} title={collapsed ? label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={clsx(
                          'group relative flex items-center rounded-[3px] text-[12px] transition-colors duration-140',
                          collapsed ? 'h-[28px] justify-center' : 'h-[28px] gap-2.5 px-2.5',
                          active
                            ? 'bg-white/[0.06] font-semibold text-white shadow-[inset_2px_0_0_var(--color-gold)]'
                            : 'text-white/55 hover:bg-white/[0.045] hover:text-white',
                        )}>
                        <Icon size={14} strokeWidth={active ? 2.2 : 1.9} className="shrink-0" />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          </nav>
          {/* Fades the last row rather than slicing it. Only drawn on viewports
              short enough that the list genuinely does not fit, so it stops
              making a reachable item look like a rendering fault. */}
          <span aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-8 bg-gradient-to-t from-sidebar to-transparent [@media(max-height:840px)]:block" />
        </div>
      </aside>
    </>
  );
}
