'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { Plus } from 'lucide-react';

export interface Faq { q: string; a: string }

/**
 * Disclosure list.
 *
 * Built on <details>/<summary> rather than divs with click handlers, so it
 * works before hydration, responds to Enter and Space without extra code, and
 * is findable by in-page search when open.
 */
export function FaqAccordion({ items, className }: { items: Faq[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className={clsx('divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/[0.07]', className)}>
      {items.map((item, i) => (
        <details
          key={item.q}
          open={open === i}
          onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open ? i : (open === i ? null : open))}
          className="group bg-navy-card/40 transition-colors open:bg-navy-card/70"
        >
          <summary className="flex cursor-pointer list-none items-start gap-4 px-5 py-4.5 text-[14.5px] font-medium text-white transition-colors hover:text-brand-gold sm:px-6 [&::-webkit-details-marker]:hidden">
            <span className="flex-1 py-0.5">{item.q}</span>
            <span aria-hidden
                  className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/12 text-white/60 transition-transform duration-300 group-open:rotate-45 group-open:border-brand-gold/40 group-open:text-brand-gold">
              <Plus size={14} />
            </span>
          </summary>
          <p className="px-5 pb-5 pr-14 text-[13.5px] leading-[1.8] text-white/58 sm:px-6">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
