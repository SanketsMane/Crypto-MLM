'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { X, Info, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { clsx } from 'clsx';
import { get, post } from '@/lib/api';

type Severity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

interface Banner {
  id: string; title: string; body: string; severity: Severity;
  link: string | null; publishedAt: string;
}

const STYLE: Record<Severity, { wrap: string; icon: typeof Info }> = {
  INFO:     { wrap: 'border-gold/25 bg-gold-soft', icon: Info },
  SUCCESS:  { wrap: 'border-good/25 bg-good-soft',     icon: CheckCircle2 },
  WARNING:  { wrap: 'border-warn/30 bg-warn-soft',     icon: AlertTriangle },
  CRITICAL: { wrap: 'border-bad/30 bg-bad-soft',       icon: AlertOctagon },
};

/**
 * Pinned operator notices, at the top of the member app.
 *
 * Dismissal is per-member and stored server-side rather than in local storage —
 * someone who clears a banner on their phone should not meet it again on their
 * laptop, and local storage cannot know that.
 */
export function AnnouncementBanners() {
  const qc = useQueryClient();

  const banners = useQuery<Banner[]>({
    queryKey: ['member', 'banners'],
    queryFn: () => get('/announcements'),
    staleTime: 60_000,
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => post(`/announcements/${id}/dismiss`),
    // Optimistic: the banner should go the instant it is clicked, not after a
    // round trip. Nothing is lost if the call fails — it returns on reload.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['member', 'banners'] });
      const previous = qc.getQueryData<Banner[]>(['member', 'banners']);
      qc.setQueryData<Banner[]>(['member', 'banners'], (old) => (old ?? []).filter((b) => b.id !== id));
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(['member', 'banners'], ctx.previous);
    },
  });

  if (!banners.data?.length) return null;

  return (
    <div className="mb-4 space-y-2">
      {banners.data.map((b) => {
        const { wrap, icon: Icon } = STYLE[b.severity];
        return (
          <div key={b.id} className={clsx('flex items-start gap-3 rounded-[5px] border px-4 py-3 text-ink', wrap)}>
            <Icon size={17} className="mt-0.5 shrink-0 opacity-80" />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold leading-snug">{b.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{b.body}</p>
              {b.link && (
                <Link href={b.link} className="mt-1.5 inline-block text-[12.5px] font-medium underline underline-offset-2">
                  Read more
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss.mutate(b.id)}
              aria-label={`Dismiss ${b.title}`}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-[3px] text-ink-3 transition hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
