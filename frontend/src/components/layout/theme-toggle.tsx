'use client';

import { useRef } from 'react';
import { clsx } from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/providers/theme-provider';
import type { Theme } from '@/lib/theme';

/**
 * Theme switch — a segmented track with a gold thumb that slides between the
 * sun and the moon.
 *
 * The thumb position and the icon colours are expressed with the `dark:`
 * variant, which this project maps to `[data-theme="dark"]`. That means the
 * switch is already in the right position in the first painted frame, before
 * React hydrates — it never flickers or "catches up". React state is used only
 * for the ARIA wiring and the click handlers.
 *
 * Semantics are a radiogroup with arrow-key selection, the pattern screen
 * reader users expect from a segmented control.
 */
export function ThemeToggle({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const { theme, ready, setTheme } = useTheme();
  const groupRef = useRef<HTMLDivElement>(null);

  const pick = (t: Theme) => {
    setTheme(t);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-mode="${t}"]`)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'Home') { e.preventDefault(); pick('light'); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'End') { e.preventDefault(); pick('dark'); }
  };

  const sm = size === 'sm';
  const cell = sm ? 'h-6 w-6' : 'h-7 w-7';
  const icon = sm ? 13 : 15;

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Colour theme"
      onKeyDown={onKeyDown}
      className={clsx(
        'relative isolate inline-flex items-center rounded-full border border-line bg-canvas',
        'shadow-[inset_0_1px_2px_rgba(16,24,40,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]',
        'focus-within:ring-2 focus-within:ring-gold/45',
        sm ? 'p-[3px]' : 'p-1',
        className,
      )}
    >
      {/* the thumb — one element that slides, rather than two that flash */}
      <span
        aria-hidden
        className={clsx(
          'absolute -z-10 rounded-full bg-gold shadow-[0_1px_3px_rgba(16,24,40,0.28)]',
          'transition-transform duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)]',
          cell,
          // one set of position utilities per size — never two competing ones
          sm ? 'left-[3px] top-[3px] dark:translate-x-6' : 'left-1 top-1 dark:translate-x-7',
        )}
      />

      <button
        type="button"
        role="radio"
        data-mode="light"
        aria-checked={ready ? theme === 'light' : undefined}
        aria-label="Switch to light mode"
        title="Light mode"
        tabIndex={ready && theme === 'dark' ? -1 : 0}
        onClick={() => setTheme('light')}
        className={clsx(
          'grid place-items-center rounded-full outline-none transition-colors duration-200', cell,
          'text-gold-on dark:text-ink-3 dark:hover:text-ink',
        )}
      >
        <Sun size={icon} strokeWidth={2.2} />
      </button>

      <button
        type="button"
        role="radio"
        data-mode="dark"
        aria-checked={ready ? theme === 'dark' : undefined}
        aria-label="Switch to dark mode"
        title="Dark mode"
        tabIndex={ready && theme === 'dark' ? 0 : -1}
        onClick={() => setTheme('dark')}
        className={clsx(
          'grid place-items-center rounded-full outline-none transition-colors duration-200', cell,
          'text-ink-3 hover:text-ink dark:text-gold-on dark:hover:text-gold-on',
        )}
      >
        <Moon size={icon} strokeWidth={2.2} />
      </button>
    </div>
  );
}
