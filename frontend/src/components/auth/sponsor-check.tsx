'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, Loader2, UserPlus, XCircle } from 'lucide-react';
import { apiBase } from '@/lib/api-base';

export type SponsorState =
  | { status: 'empty' }
  | { status: 'checking' }
  | { status: 'found'; userCode: string; name: string }
  | { status: 'missing' };

/**
 * Confirms a referral code as it is typed.
 *
 * Network placement is permanent — every commission ever paid depends on it,
 * so it cannot be corrected later. A mistyped code silently puts someone in
 * the wrong upline forever, which is why this resolves the name before the
 * account is created rather than after.
 */
export function useSponsorCheck(code: string) {
  const [state, setState] = useState<SponsorState>({ status: 'empty' });

  useEffect(() => {
    const value = code.trim().toUpperCase();
    if (value.length < 3) { setState({ status: 'empty' }); return; }

    setState({ status: 'checking' });
    const controller = new AbortController();
    // Debounced: nobody needs a request per keystroke.
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase()}/auth/sponsor/${encodeURIComponent(value)}`, { signal: controller.signal });
        if (!res.ok) { setState({ status: 'missing' }); return; }
        const body = await res.json();
        setState({ status: 'found', userCode: body.data.userCode, name: body.data.name });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ status: 'missing' });
      }
    }, 450);

    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [code]);

  return state;
}

export function SponsorFeedback({ state }: { state: SponsorState }) {
  if (state.status === 'empty') return null;

  if (state.status === 'checking') {
    return (
      <span className="mt-2 flex items-center gap-1.5 text-[11.5px] text-white/40">
        <Loader2 size={12} className="animate-spin" /> Checking that code…
      </span>
    );
  }

  if (state.status === 'missing') {
    return (
      <span className="mt-2 flex items-center gap-1.5 text-[11.5px] text-bad">
        <XCircle size={12} /> No account matches that code. Check it with the person who invited you.
      </span>
    );
  }

  return (
    <span className={clsx('mt-2 flex items-center gap-2 rounded-[9px] border border-good/25 bg-good/10 px-3 py-2 text-[12px] text-white')}>
      <CheckCircle2 size={13} className="shrink-0 text-good" />
      {/* one flex item, or the container's gap opens up around the possessive */}
      <span>Joining <strong className="font-semibold">{state.name}</strong>&apos;s team</span>
      <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-white/45">
        <UserPlus size={11} /> {state.userCode}
      </span>
    </span>
  );
}
