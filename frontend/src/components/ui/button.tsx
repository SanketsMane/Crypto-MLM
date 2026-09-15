'use client';
import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
};

/**
 * The older button API, kept for the pages that already use it. Same shape,
 * same props — only the palette moved onto the design tokens, so it themes
 * with everything else. `primary` is the gold brand CTA.
 */
export function Button({ variant = 'primary', loading, className, children, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-[4px] px-3.5 py-2 text-[13px] font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
        variant === 'primary' && 'bg-gold text-gold-on hover:bg-gold-hi active:bg-gold-dark',
        variant === 'ghost' && 'border border-line bg-card text-ink hover:border-line-strong hover:bg-canvas',
        variant === 'danger' && 'bg-bad text-white hover:brightness-110 focus-visible:ring-bad/25',
        className,
      )}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}
