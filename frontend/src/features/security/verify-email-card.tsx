'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MailCheck, MailWarning } from 'lucide-react';
import { get, post } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHead, Button, Badge, Skeleton, controlCls } from '@/components/ui/primitives';
import { toastError } from '@/lib/toast';

interface Me { email: string; emailVerifiedAt: string | null }

/**
 * Email verification.
 *
 * Verified addresses matter more here than on a normal product: password
 * resets and withdrawal confirmations are both delivered by email, so an
 * unverified address means the recovery path for an account holding money
 * points somewhere nobody has proved they control.
 *
 * The card disappears entirely once verified — a permanent green tick is just
 * clutter on a page people visit to change something.
 */
export function VerifyEmailCard() {
  const qc = useQueryClient();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const me = useQuery<Me>({ queryKey: ['me'], queryFn: () => get('/auth/me') });

  const send = useMutation({
    mutationFn: () => post<{ challengeId: string }>('/auth/verify-email/send'),
    onSuccess: (d) => { setChallengeId(d.challengeId); toast.success('Code sent — check your inbox'); },
    onError: (e) => toastError(e),
  });

  const confirm = useMutation({
    mutationFn: () => post('/auth/verify-email/confirm', { challengeId, code }),
    onSuccess: () => {
      toast.success('Email verified');
      setChallengeId(null); setCode('');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toastError(e),
  });

  if (me.isLoading) {
    return <Card><CardHead title="Email address" /><div className="px-5 pb-5"><Skeleton className="h-16" /></div></Card>;
  }
  if (me.data?.emailVerifiedAt) return null;

  return (
    <Card>
      <CardHead
        title="Email address"
        subtitle="Password resets and withdrawal codes are sent here."
        right={<Badge tone="warn">Unverified</Badge>}
      />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex items-start gap-3 rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warn/15 text-warn">
            <MailWarning size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-ink">{me.data?.email}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
              Not verified yet. Until it is, we cannot be sure a reset link or withdrawal code
              reaches you rather than someone else.
            </p>
          </div>
        </div>

        {challengeId ? (
          <form className="space-y-2.5" onSubmit={(e) => { e.preventDefault(); confirm.mutate(); }}>
            <p className="text-[12.5px] text-ink-2">Enter the 6-digit code we just sent.</p>
            <input inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className={`${controlCls} h-11 w-full max-w-[180px] text-center font-mono text-[16px] tracking-[0.3em]`} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={confirm.isPending} disabled={code.length !== 6}>
                <MailCheck size={14} /> Verify
              </Button>
              <Button type="button" variant="outline" loading={send.isPending} onClick={() => send.mutate()}>
                Send again
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" loading={send.isPending} onClick={() => send.mutate()}>
            <MailCheck size={14} /> Send verification code
          </Button>
        )}
      </div>
    </Card>
  );
}
