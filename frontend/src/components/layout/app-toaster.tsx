'use client';

import { Toaster } from 'sonner';
import { useTheme } from '@/providers/theme-provider';

/**
 * Toasts follow the active theme. Their surface colours come from the design
 * tokens (see `[data-sonner-toaster]` in globals.css); the `theme` prop only
 * tells sonner which of its own defaults to start from.
 *
 * Errors stay twice as long as confirmations. A success message is a courtesy —
 * the screen already shows the result — but an error is the only place the
 * reason appears, and four seconds is not long enough to read a sentence and
 * decide what to do about it.
 */
export function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      theme={theme}
      // Stacked rather than collapsed: with a money action in flight, seeing
      // both "withdrawal requested" and a following error matters.
      expand
      visibleToasts={4}
      // Per-type duration: errors get long enough to actually read.
      duration={4_000}
      toastOptions={{
        duration: 4_000,
        style: { borderRadius: '12px', fontFamily: 'var(--font-sans)' },
      }}
    />
  );
}
