import Link from 'next/link';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';

/**
 * The dashboard's primary call to action.
 *
 * Deliberately not `Button variant="gold"`: that variant puts white on gold,
 * which lands near 3:1. On a page whose whole job is to be trusted, the CTA
 * runs navy-on-gold instead — the same pairing the sidebar uses. Kept local to
 * the dashboard so the shared button keeps its contract everywhere else.
 */
export const goldCta = clsx(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[5px] px-4',
  'bg-[linear-gradient(135deg,var(--color-gold-hi)_0%,var(--color-gold)_100%)]',
  'font-semibold text-navy',
  'shadow-[0_1px_2px_rgba(15,23,42,0.10),0_6px_16px_-8px_rgba(226,103,10,0.7)]',
  'transition-all duration-150 hover:brightness-[1.06]',
  'hover:shadow-[0_1px_2px_rgba(15,23,42,0.12),0_10px_22px_-8px_rgba(226,103,10,0.85)]',
  'active:scale-[0.985]',
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/30',
);

export function GoldCta(
  { href, children, size = 'md', className }:
  { href: string; children: ReactNode; size?: 'sm' | 'md'; className?: string },
) {
  return (
    <Link
      href={href}
      className={clsx(goldCta, size === 'sm' ? 'h-9 text-[13px]' : 'h-10 text-[13.5px]', className)}
    >
      {children}
    </Link>
  );
}
