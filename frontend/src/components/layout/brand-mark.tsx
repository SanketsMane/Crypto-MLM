'use client';

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
 *
 * ── Two bugs fixed here the first time real artwork was uploaded ──
 *
 * The uploaded logo used to render as `next/image` with `fill` inside a bare
 * `<span className="relative block">`. A filled image is absolutely positioned
 * and takes its size from its parent, and that span had no height — so the
 * logo collapsed to nothing at twelve of the thirteen call sites. Only the
 * public header, which happened to pass `className="h-8"`, ever showed it.
 * A plain `<img>` with a height and `w-auto` is the right tool here anyway:
 * the operator's artwork has whatever aspect ratio it has, and the browser
 * already knows it from the file. Asking `next/image` to optimise a 50KB PNG
 * that is already being streamed through our own route buys nothing.
 *
 * And `variant="mark"` ignored uploaded artwork entirely, so a collapsed
 * sidebar kept showing the generic drawn glyph next to a fully branded page.
 */
export function BrandMark({
  variant = 'full',
  surface,
  ink = 'theme',
  className,
}: {
  /** `full` is mark + wordmark; `mark` is the square glyph alone. */
  variant?: 'full' | 'mark';
  /**
   * Which ground this sits on, and therefore which logo to use.
   *
   * Left unset it follows the theme, swapping the two files in CSS rather
   * than in JavaScript — a `useTheme()` read here would render the wrong
   * logo on the server and correct it after hydration, which is a visible
   * flash on every page load.
   */
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
  const name = brandName(brand);

  /* Each slot falls back to the other, so an operator who uploads only one
     logo still gets it everywhere rather than a gap on half the product. */
  const onLight = brand.assets['logo-light'] ?? brand.assets['logo-dark'];
  const onDark = brand.assets['logo-dark'] ?? brand.assets['logo-light'];
  const icon = brand.assets.icon;

  /* `ink="onDark"` already means "this ground is dark in both themes", and
     nine call sites say it without also saying `surface`. Honouring it keeps
     them correct without a sweep. */
  const ground = surface ?? (ink === 'onDark' ? 'dark' : 'theme');

  if (variant === 'mark' && icon) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={icon} alt={name} className={clsx('block size-[22px] shrink-0 object-contain', className)} />;
  }

  if (variant === 'full' && (onLight || onDark)) {
    const img = (src: string, extra?: string) => (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt={name}
        /* h-7 is the default because the console rail is a 52px header; every
           call site can override it, and `w-auto` keeps the operator's own
           aspect ratio whatever it is. */
        className={clsx('block h-7 w-auto max-w-full object-contain object-left', extra, className)}
      />
    );

    if (ground === 'dark') return img(onDark!);
    if (ground === 'light') return img(onLight!);
    return (
      <>
        {img(onLight!, 'dark:hidden')}
        {img(onDark!, 'hidden dark:block')}
      </>
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
