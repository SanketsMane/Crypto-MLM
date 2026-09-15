'use client';

import { useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button, controlCls } from '@/components/ui/primitives';
import { post, apiErrorMessage } from '@/lib/api';

/**
 * Re-authentication, in exchange for a short-lived ticket.
 *
 * A valid session proves somebody signed in on this device at some point. It
 * does not prove the person holding the phone right now is the member — and
 * that gap is the whole attack on a payout. The server asks for this before it
 * will move money out of the platform, and returns `STEP_UP_REQUIRED` with the
 * method it wants when it does not get it.
 *
 * The ticket is never stored. It lives in a promise between "confirm" and the
 * request it authorises, expires in minutes, and is bound to this session — so
 * there is nothing here worth stealing from `localStorage` later.
 */

export type StepUpMethod = 'password' | 'totp';

interface Pending {
  method: StepUpMethod;
  resolve: (token: string) => void;
  reject: (reason: Error) => void;
}

export interface StepUpRequest {
  /** Which factor the server insists on. `totp` is demanded above a threshold. */
  method?: StepUpMethod;
  /** Shown above the field, so the member knows what they are approving. */
  reason?: string;
}

/**
 * Reads the method the server asked for out of a rejected request.
 *
 * A withdrawal over the operator's threshold comes back asking specifically for
 * `totp`, and re-prompting for a password would loop forever.
 */
export function stepUpNeeded(err: unknown): StepUpMethod | null {
  const body = (err as { response?: { data?: { error?: { code?: string; details?: { require?: StepUpMethod } } } } })
    ?.response?.data?.error;
  if (body?.code !== 'STEP_UP_REQUIRED') return null;
  return body.details?.require ?? 'password';
}

export function useStepUp() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState<string | undefined>();

  /** Opens the dialog and resolves with a ticket, or rejects if cancelled. */
  const confirm = (req: StepUpRequest = {}) =>
    new Promise<string>((resolve, reject) => {
      setReason(req.reason);
      setPending({ method: req.method ?? 'password', resolve, reject });
    });

  const dialog = (
    <StepUpDialog
      pending={pending}
      reason={reason}
      onDone={() => setPending(null)}
    />
  );

  return { confirm, dialog };
}

function StepUpDialog({
  pending, reason, onDone,
}: {
  pending: Pending | null;
  reason?: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const totp = pending?.method === 'totp';

  useEffect(() => {
    if (!pending) return;
    setValue(''); setError(null); setBusy(false);
    // Focus lands on the field, not the dialog: this is a one-input form and
    // making the member tab into it is friction on the safety step itself.
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending) return null;

  const cancel = () => {
    pending.reject(new Error('cancelled'));
    onDone();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !value.trim()) return;
    setBusy(true); setError(null);
    try {
      const { token } = await post<{ token: string; method: StepUpMethod }>(
        '/auth/step-up',
        totp ? { code: value.trim() } : { password: value },
      );
      pending.resolve(token);
      onDone();
    } catch (err) {
      // Stays open: a mistyped password should cost one more attempt, not the
      // whole flow and everything the member typed before it.
      setError(apiErrorMessage(err));
      setBusy(false);
      inputRef.current?.select();
    }
  };

  return (
    <Modal
      open
      onClose={cancel}
      title="Confirm it is you"
      description={reason ?? 'This step protects your payout from anyone who picks up your unlocked device.'}
      icon={
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[5px] bg-gold-soft text-gold-on-soft ring-1 ring-gold/30">
          <ShieldCheck size={16} strokeWidth={2.2} aria-hidden />
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={cancel} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!value.trim()}>
            Confirm
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3 pb-1">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
            {totp
              ? <><Smartphone size={13} aria-hidden /> Code from your authenticator app</>
              : <><KeyRound size={13} aria-hidden /> Your password</>}
          </span>
          <input
            ref={inputRef}
            type={totp ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(totp ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
            inputMode={totp ? 'numeric' : undefined}
            autoComplete={totp ? 'one-time-code' : 'current-password'}
            placeholder={totp ? '000000' : '••••••••'}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'step-up-error' : undefined}
            className={`${controlCls} h-11 w-full ${totp ? 'text-[18px] tracking-[0.4em] tabular-nums' : ''}`}
          />
        </label>

        {totp && (
          <p className="text-[11.5px] leading-relaxed text-ink-2">
            This amount is above the limit a password alone can approve, so it needs the
            six-digit code from your authenticator.
          </p>
        )}

        {error && (
          <p id="step-up-error" role="alert" className="rounded-[4px] bg-bad-soft px-3 py-2 text-[12px] text-bad">
            {error}
          </p>
        )}

        {/* Enter submits without a visible second button. */}
        <button type="submit" className="sr-only">Confirm</button>
      </form>
    </Modal>
  );
}
