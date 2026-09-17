'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowRight, Facebook, Instagram, Mail, Menu, Send, Twitter, X } from 'lucide-react';
import { BrandMark } from '@/components/layout/brand-mark';
import { useBrand, useBrandName } from '@/providers/brand-provider';
import { ThemeToggle } from '@/components/layout/theme-toggle';

const NAV = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Opportunity', href: '/opportunity' },
  { label: 'Terms', href: '/terms' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
];

const SOCIAL = [
  { Icon: Facebook, label: 'Facebook', href: 'https://www.facebook.com' },
  { Icon: Instagram, label: 'Instagram', href: 'https://www.instagram.com' },
  { Icon: Twitter, label: 'X', href: 'https://x.com' },
  { Icon: Send, label: 'Telegram', href: 'https://t.me' },
];

/** Utility strip above the nav — contact on the left, socials right.
    Was a full-width fill of the accent colour. A hairline strip on the page
    surface reads as chrome; a solid orange band read as a promotion. */
export function TopBar() {
  const brand = useBrand();
  return (
    <div className="border-b border-[var(--home-line)] bg-[var(--home-surface)] text-[var(--home-text-2)]">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-y-2 px-4 py-2.5 sm:px-6">
        {/* The operator's address, not a build-time constant. */}
        <a href={`mailto:${brand.supportEmail}`}
           className="flex items-center gap-2 text-[12.5px] font-medium transition-colors hover:text-[var(--home-gold)]">
          <Mail size={14} strokeWidth={2.2} aria-hidden />
          {brand.supportEmail}
        </a>
        <div className="flex items-center gap-3">
          <span className="hidden border-r border-[var(--home-line)] pr-3 text-[12.5px] font-semibold sm:block">
            Follow Us:
          </span>
          <ul className="flex items-center gap-2">
            {SOCIAL.map(({ Icon, label, href }) => (
              <li key={label}>
                <a href={href} target="_blank" rel="noreferrer noopener" aria-label={label}
                   className="grid h-7 w-7 place-items-center rounded-[4px] border border-[var(--home-line)] transition-colors hover:border-[var(--home-gold)] hover:text-[var(--home-gold)]">
                  <Icon size={13} strokeWidth={2.2} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Primary navigation. Becomes a sticky translucent bar once the hero has
 * scrolled past, which is the behaviour the original's `header-fixed` class
 * produces — here it is a scroll listener rather than a jQuery plugin.
 */
export function Nav() {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const brandLabel = useBrandName();

  /* "/" only matches itself — every other entry also owns anything nested
     beneath it, so /legal/terms would still light up Terms if it ever moved. */
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 120);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={clsx(
      'sticky top-0 z-50 transition-colors duration-300',
      'border-b border-[var(--home-line)]',
      /* Translucent once scrolled so the video shows through, opaque at rest.
         Both follow the theme — this used to be black in light mode too. */
      stuck
        ? 'bg-[color-mix(in_srgb,var(--home-bg)_82%,transparent)] backdrop-blur-md'
        : 'bg-[var(--home-bg)]',
    )}>
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-4 py-4 sm:px-6">
        {/* The operator's mark. Was a baked-in PNG of someone else's brand. */}
        <Link href="/" className="block shrink-0" aria-label={`${brandLabel} — home`}>
          {/* No `surface` — this header follows the theme (see --home-bg
              above), so the logo has to follow it too. Pinning it to the dark
              artwork put a white wordmark on a near-white header. */}
          <BrandMark variant="full" className="h-8" />
        </Link>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-7">
            {NAV.map((n) => {
              const active = isActive(n.href);
              return (
                <li key={n.label}>
                  <Link href={n.href} aria-current={active ? 'page' : undefined} className={clsx(
                    'relative text-[15px] font-medium transition-colors',
                    'after:absolute after:-bottom-1.5 after:left-0 after:h-[2px] after:w-0 after:bg-[var(--home-gold)] after:transition-all after:duration-300 hover:after:w-full',
                    /* Was `text-[var(--home-text)]`, which vanished the moment the header
                       stopped being black in light mode. */
                    active ? 'text-[var(--home-gold)] after:w-full' : 'text-[var(--home-text)] hover:text-[var(--home-gold)]',
                  )}>
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {/* The same switch the console uses, not a second implementation.
              It reads `data-theme` off <html>, so it is already in the right
              position in the first painted frame rather than catching up
              after hydration. */}
          <ThemeToggle size="sm" />
          <Link href="/register" className="text-[14px] font-medium text-[var(--home-text)] transition-colors hover:text-[var(--home-gold)]">
            Sign Up
          </Link>
          <Link href="/login"
                className="group inline-flex items-center gap-2 rounded-[4px] bg-[var(--home-gold)] px-5 py-2.5 text-[14px] font-semibold text-[var(--color-gold-on)] transition-colors hover:bg-[var(--home-gold-hi)]">
            Sign In
            <ArrowRight size={15} strokeWidth={2.6} aria-hidden
                        className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* On a phone the switch sits beside the menu button rather than inside
            the drawer — changing theme should not cost two taps and a scroll. */}
        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle size="sm" />
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                  aria-label={open ? 'Close menu' : 'Open menu'}
                  className="grid h-9 w-9 place-items-center rounded-[4px] border border-[var(--home-line)] text-[var(--home-text)]">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* mobile drawer — grid-rows trick so it animates to its own height */}
      <div className={clsx(
        'grid overflow-hidden border-[var(--home-line)] transition-all duration-300 lg:hidden',
        open ? 'grid-rows-[1fr] border-t' : 'grid-rows-[0fr]',
      )}>
        <div className="min-h-0">
          <ul className="space-y-1 px-4 py-4 sm:px-6">
            {NAV.map((n) => {
              const active = isActive(n.href);
              return (
                <li key={n.label}>
                  <Link href={n.href} onClick={() => setOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={clsx(
                          'block rounded-lg px-3 py-2.5 text-[15px] transition',
                          active
                            ? 'bg-[var(--home-gold)]/10 font-semibold text-[var(--home-gold)]'
                            : 'text-[var(--home-text)] hover:bg-[var(--home-surface)] hover:text-[var(--home-gold)]',
                        )}>
                    {n.label}
                  </Link>
                </li>
              );
            })}
            <li className="flex gap-2 px-3 pt-3">
              <Link href="/register" onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg border border-[var(--home-line)] py-2.5 text-center text-[14.5px] font-medium text-[var(--home-text)]">
                Sign Up
              </Link>
              <Link href="/login" onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg bg-[var(--home-gold)] py-2.5 text-center text-[14.5px] font-semibold text-[var(--color-gold-on)]">
                Sign In
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}

/** Footer over the template's angled backdrop artwork. */
export function Footer() {
  return (
    <footer id="contact" className="relative isolate overflow-hidden border-t border-[var(--home-line)]">
      <Image src="/home/footerbg.png" alt="" aria-hidden fill sizes="100vw"
             className="-z-10 object-cover opacity-40" />
      <div className="mx-auto max-w-[1320px] px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <div className="relative h-[46px] w-[190px]">
              <BrandMark />
            </div>
            <p className="mt-5 max-w-[46ch] text-[13.5px] leading-[1.8] text-[var(--home-text-2)]">
              We make forex trading simple, transparent and
              accessible for everyone.
            </p>
            <ul className="mt-6 flex items-center gap-2.5">
              {SOCIAL.map(({ Icon, label, href }) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noreferrer noopener" aria-label={label}
                     className="grid h-9 w-9 place-items-center rounded-full border border-[var(--home-line)] text-[var(--home-text)] transition hover:border-[var(--home-gold)] hover:bg-[var(--home-gold)] hover:text-[var(--color-gold-on)]">
                    <Icon size={15} strokeWidth={2.1} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {[
            // Markets and Rewards are sections of the home page; the rest are
            // pages of their own. Both forms work from anywhere in the group.
            { head: 'Company', links: [['About', '/about'], ['Markets', '/#markets'], ['Rewards', '/#rewards']] },
            { head: 'Quick Link', links: [['Terms & Conditions', '/terms'], ['FAQ', '/faq'], ['Contact', '/contact']] },
          ].map((col) => (
            <div key={col.head}>
              <h3 className="text-[16px] font-semibold text-[var(--home-text)]">{col.head}</h3>
              <ul className="mt-5 space-y-3">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href}
                          className="text-[13.5px] text-[var(--home-text-2)] transition hover:text-[var(--home-gold)]">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--home-line)] pt-6 text-[12.5px] text-[var(--home-text-3)]">
          <p>Copyright {new Date().getFullYear()}. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/legal/privacy" className="transition hover:text-[var(--home-gold)]">Privacy Policy</Link>
            <Link href="/legal/cookies" className="transition hover:text-[var(--home-gold)]">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
