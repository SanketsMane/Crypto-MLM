'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { ArrowRight, Menu, X } from 'lucide-react';
import { BrandMark } from '@/components/layout/brand-mark';

const NAV = [
  { href: '/about', label: 'About' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/plans', label: 'Plans' },
  { href: '/rewards', label: 'Rewards' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  /* The header starts transparent over the hero and gains a surface once the
     page moves, so the artwork is never cut by a bar that has nothing to
     separate it from. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled || open
          ? 'border-b border-white/[0.07] bg-navy-deep/85 backdrop-blur-xl'
          : 'border-b border-transparent',
      )}
    >
      <nav className="mx-auto flex h-[68px] w-full max-w-[1200px] items-center gap-6 px-5 sm:h-[76px] sm:px-8"
           aria-label="Primary">
        <Link href="/" className="block w-fit shrink-0 sm:h-9 sm:w-[150px]" aria-label="Home">
          <BrandMark ink="onDark" />
        </Link>

        <ul className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'relative rounded-lg px-3.5 py-2 text-[13.5px] transition-colors',
                    active ? 'text-white' : 'text-white/60 hover:text-white',
                  )}
                >
                  {item.label}
                  {active && (
                    <span aria-hidden className="absolute inset-x-3.5 -bottom-0.5 h-px bg-brand-gold" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Link
            href="/login"
            className="hidden rounded-[10px] px-4 py-2.5 text-[13.5px] font-medium text-white/75 transition hover:text-white sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="hidden items-center gap-1.5 rounded-[10px] bg-gold px-4 py-2.5 text-[13.5px] font-semibold text-navy shadow-[0_8px_22px_-10px_rgba(255,122,26,0.7)] transition hover:brightness-110 sm:inline-flex"
          >
            Open account
            <ArrowRight size={14} strokeWidth={2.5} />
          </Link>

          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="grid h-10 w-10 place-items-center rounded-[10px] border border-white/12 text-white transition hover:bg-white/[0.06] lg:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* mobile sheet */}
      <div
        className={clsx(
          'overflow-hidden border-t border-white/[0.07] bg-navy-deep transition-[max-height,opacity] duration-300 lg:hidden',
          open ? 'max-h-[560px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <ul className="px-5 py-3 sm:px-8">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  'block border-b border-white/[0.05] py-3.5 text-[15px] transition-colors',
                  pathname === item.href ? 'font-medium text-brand-gold' : 'text-white/75 hover:text-white',
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex gap-2.5 px-5 pb-5 sm:px-8">
          <Link href="/login"
                className="flex-1 rounded-[10px] border border-white/14 py-3 text-center text-[14px] font-medium text-white">
            Sign in
          </Link>
          <Link href="/register"
                className="flex-1 rounded-[10px] bg-gold py-3 text-center text-[14px] font-semibold text-navy">
            Open account
          </Link>
        </div>
      </div>
    </header>
  );
}
