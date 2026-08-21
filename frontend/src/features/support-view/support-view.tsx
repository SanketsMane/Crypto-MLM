'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, X } from 'lucide-react';
import { tokens } from '@/lib/api';

const HANDOFF_KEY = 'fx_support_view';
const ACTIVE_KEY = 'fx_support_view_active';

/**
 * Picks up a support session handed over from the admin console.
 *
 * The tokens travel through sessionStorage rather than the URL: an access token
 * in a query string ends up in browser history, in the referer header, and in
 * every proxy log between here and the server.
 *
 * sessionStorage is also per-tab, which is what keeps an operator's support view
 * from quietly replacing a real member's login on a shared machine.
 */
export function SupportViewBar() {
  const router = useRouter();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handoff = sessionStorage.getItem(HANDOFF_KEY);
    if (handoff) {
      try {
        const { accessToken, refreshToken } = JSON.parse(handoff) as {
          accessToken: string; refreshToken: string;
        };
        tokens.set(accessToken, refreshToken);
        sessionStorage.removeItem(HANDOFF_KEY);
        sessionStorage.setItem(ACTIVE_KEY, '1');
        setActive(true);
        // Drop the marker so a refresh does not look like a fresh handoff.
        router.replace('/dashboard');
        return;
      } catch {
        sessionStorage.removeItem(HANDOFF_KEY);
      }
    }
    setActive(sessionStorage.getItem(ACTIVE_KEY) === '1');
  }, [router]);

  if (!active) return null;

  const leave = () => {
    sessionStorage.removeItem(ACTIVE_KEY);
    tokens.clear();
    window.close();
    // close() is a no-op unless the tab was opened by script — go somewhere sane.
    window.location.href = '/login';
  };

  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-warn/30 bg-warn-soft px-4 py-2">
      <Eye size={15} className="shrink-0 text-warn" />
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink">
        <strong className="font-semibold">Support view.</strong>{' '}
        You are seeing this member&apos;s account. Nothing here can be changed — the server refuses
        it. The session ends in 30 minutes.
      </p>
      <button
        type="button"
        onClick={leave}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-ink-2 transition hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
      >
        <X size={13} /> Leave
      </button>
    </div>
  );
}
