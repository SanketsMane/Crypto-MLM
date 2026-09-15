'use client';

import Image from 'next/image';
import { useBrand } from '@/providers/brand-provider';
import { brandName, isPlaceholder } from '@/lib/branding';
import clsx from 'clsx';

/**
 * The wordmark, wherever one is shown.
 *
 * Replaces the hardcoded `/brand/FX-wordmark.png` that every surface pointed
 * at — a gold FortuneX render baked into the build. That file is the reason an
 * operator could set their brand name in the console and still see someone
 * else's logo on every screen.
 *
 * Three states, in order:
 *   1. the operator uploaded artwork  -> show it
 *   2. they set a name but no artwork -> draw a mark and set their name in Plex
 *   3. they have set neither          -> the same drawn mark, generic label
 *
 * State 2 is the one that matters. A white-label platform has to look
 * deliberate before anyone opens the asset uploader, so the fallback is a real
 * lockup rather than a broken-image box or an empty header.
 */
export function BrandMark({
  variant = 'full',
  surface = 'dark',
  ink = 'theme',
  className,
}: {
  /** `full` is mark + wordmark; `mark` is the square glyph alone. */
  variant?: 'full' | 'mark';
  /** Which uploaded logo to prefer. The rail is dark in both themes. */
  surface?: 'light' | 'dark';
  /**
   * Which ink the wordmark takes.
   *
   * `theme` follows the page and is the right default. `onDark` forces white,
   * for the one place that is dark in BOTH themes — the console's rail.
   *
   * This existed as a hardcoded `text-white` and was invisible the moment the
   * public header stopped being black in light mode.
   */
  ink?: 'theme' | 'onDark';
  className?: string;
}) {
  const brand = useBrand();
  const uploaded = surface === 'dark'
    ? brand.assets['logo-dark'] ?? brand.assets['logo-light']
    : brand.assets['logo-light'] ?? brand.assets['logo-dark'];
  const name = brandName(brand);

  if (uploaded && variant === 'full') {
    return (
      <span className={clsx('relative block', className)}>
        <Image src={uploaded} alt={name} fill sizes="200px" priority className="object-contain object-left" />
      </span>
    );
  }

  return (
    <span className={clsx('flex items-center gap-2', className)}>
      {/* Drawn, not an asset: it scales, recolours with the accent and costs
          no request. The glyph is a rising line breaking out of its box. */}
      <span
        aria-hidden
        className="grid size-[22px] shrink-0 place-items-center rounded-[3px] bg-gold text-gold-on"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l5-6 4 4 6-8" />
          <path d="M15 7h4v4" />
        </svg>
      </span>
      {variant === 'full' && (
        <span
          className={clsx(
            'truncate text-[13px] font-bold tracking-[-0.01em]',
            /* An unset brand is stated plainly rather than dressed up — the
               console banner is what asks the operator to fix it. */
            ink === 'onDark'
              ? (isPlaceholder(brand.name) ? 'text-white/45' : 'text-white')
              : (isPlaceholder(brand.name) ? 'text-ink-3' : 'text-ink'),
          )}
        >
          {name}
        </span>
      )}
    </span>
  );
}
