'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { ADMIN_NAV } from './nav-config';
import { useAdmin } from '@/features/admin/use-admin';

interface Props {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: Props) {
  const pathname = usePathname();
  const { can } = useAdmin();
  /**
   * Groups an operator can actually reach.
   *
   * Filtered per item and then emptied groups dropped, so a Support Agent does
   * not get a "Money" heading with nothing under it — a heading over an empty
   * space reads as something failing to load.
   */
  const groups = ADMIN_NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || can(i.perm)) }))
    .filter((g) => g.items.length > 0);

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
        <div className="relative min-h-0 flex-1">
          <nav className={clsx('nav-scroll h-full overflow-y-auto pb-5', collapsed ? 'px-2' : 'px-3')}>
            {groups.map((group, groupIndex) => (
              <div key={group.heading} className="mb-3 last:mb-0">
                {collapsed ? (
                  // Collapsed to icons, a heading has nowhere to go — but the
                  // grouping still has to survive, or twenty-five icons become
                  // one undifferentiated column.
                  groupIndex > 0 && <div aria-hidden className="mx-2 mb-2 h-px bg-white/[0.07]" />
                ) : (
                  <p className="px-3 pb-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-white/55">
                    {group.heading}
                  </p>
                )}

                <ul className="space-y-1">
                  {group.items.map(({ href, label, icon: Icon, pending }) => {
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
                            // 40px rather than 44: with six groups and their
                            // headings, the taller row pushed the last section
                            // off the bottom on a laptop screen.
                            collapsed ? 'h-10 justify-center' : 'h-10 gap-3 px-3',
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
                                <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/58">
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
              </div>
            ))}
          </nav>

          {/* Fades the last row instead of slicing it, so it is obvious there
              is more below rather than looking like the list simply ends. */}
          <span aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-sidebar to-transparent" />
        </div>

      </aside>
    </>
  );
}
