'use client';

import { useEffect, useId, useRef } from 'react';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

/**
 * Modal shell: backdrop, Escape to close, scroll lock, focus moved inside,
 * and the ARIA wiring. Everything that needs a dialog builds on this so the
 * behaviour is identical wherever one appears.
 */
export function Modal({
  open, onClose, title, description, children, footer, width = 'md', icon,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg';
  icon?: React.ReactNode;
  /**
   * Whether a click on the backdrop dismisses the dialog.
   *
   * Off for anything holding typed input. A stray click beside the panel is
   * indistinguishable from a click inside it right up until the form is gone,
   * and there is no undo — the operator retypes everything. Escape and the X
   * both still close it, so there is no way to get stuck.
   */
  closeOnBackdrop?: boolean;
}) {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>('input, textarea, select, button');
      (focusable ?? panelRef.current)?.focus();
    }, 20);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto p-4">
      <div
        className="fixed inset-0 bg-navy/55 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className={clsx(
          'relative my-auto w-full overflow-hidden rounded-[14px] border border-line bg-card shadow-pop outline-none',
          width === 'lg' ? 'max-w-[620px]' : 'max-w-[440px]',
        )}
      >
        <header className="flex items-start gap-3 px-5 pb-3 pt-4">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {description && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close"
                  className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-3 transition hover:bg-canvas hover:text-ink">
            <X size={16} />
          </button>
        </header>

        {children && <div className="px-5 pb-1">{children}</div>}
        {footer && <footer className="mt-4 flex justify-end gap-2 border-t border-line bg-canvas px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
