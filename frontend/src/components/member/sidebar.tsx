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
          <nav className={clsx('h-full overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')}>
          {MEMBER_NAV.map((group) => (
            <div key={group.heading} className="mb-3">
              {!collapsed && (
                <p className="px-3 pb-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-white/35">
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

        {!collapsed && (
          <div className="hidden shrink-0 px-3 pb-4 [@media(min-height:1000px)]:block">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-navy-card to-navy-deep p-4 ring-1 ring-gold-line/45">
              <p className="text-[15px] font-bold leading-tight text-white">Grow your team</p>
              <p className="mt-1.5 max-w-[86%] text-[11.5px] leading-[1.5] text-white/55">
                Invite members and earn on every level.
              </p>
              <Link href="/team"
                    className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,#D4AF37_0%,#C49A2C_100%)] px-3 py-2 text-[12px] font-semibold text-navy transition hover:brightness-110">
                Invite now <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
