'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Check, Copy, KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardHead, Button, Badge, Skeleton, controlCls } from '@/components/ui/primitives';
import { toastError } from '@/lib/toast';

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  pendingSetup: boolean;
  recoveryCodesRemaining: number;
}

interface Client {
  get: <T>(url: string) => Promise<T>;
  post: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  scope: string;
}

/**
 * Two-factor enrolment, shared by both consoles.
 *
 * The flow is deliberately three steps — password, then scan, then a code that
 * proves the authenticator is actually working — because the failure this
 * prevents is somebody enabling 2FA against a QR their phone never saved and
 * locking themselves out of their own money.
 *
 * `recoveryCodes` is only non-empty for members; an admin who loses their
 * device is restored by another Super Admin, which is auditable and the better
 * control for a console account.
 */
export function TwoFactorCard({
  client,
  subtitle,
  emphasis = false,
}: {
  client: Client;
  subtitle: string;
  emphasis?: boolean;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'idle' | 'password' | 'scan' | 'codes'>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const status = useQuery<TwoFactorStatus>({
    queryKey: [client.scope, '2fa'],
    queryFn: () => client.get(client.base),
  });

  const reset = () => { setStep('idle'); setPassword(''); setCode(''); setSetup(null); };
  const refresh = () => qc.invalidateQueries({ queryKey: [client.scope, '2fa'] });

  const begin = useMutation({
    mutationFn: () => client.post<{ secret: string; qrDataUrl: string }>(`${client.base}/begin`, { password }),
    onSuccess: (d) => { setSetup(d); setStep('scan'); },
    onError: (e) => toastError(e),
  });

  const confirm = useMutation({
    mutationFn: () => client.post<{ recoveryCodes?: string[] }>(`${client.base}/confirm`, { code }),
    onSuccess: (d) => {
      refresh();
      setCode('');
      if (d.recoveryCodes?.length) { setCodes(d.recoveryCodes); setStep('codes'); }
      else reset();
      toast.success('Two-factor authentication is on');
    },
    onError: (e) => toastError(e),
  });

  const disable = useMutation({
    mutationFn: () => client.post(`${client.base}/disable`, { password, code }),
    onSuccess: () => { reset(); refresh(); toast.success('Two-factor authentication turned off'); },
    onError: (e) => toastError(e),
  });

  const regenerate = useMutation({
    mutationFn: () => client.post<{ recoveryCodes: string[] }>(`${client.base}/recovery-codes`, { password, code }),
    onSuccess: (d) => { setCodes(d.recoveryCodes); setStep('codes'); setCode(''); refresh(); },
    onError: (e) => toastError(e),
  });

  const copyCodes = async () => {
    await navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (status.isLoading) {
    return (
      <Card>
        <CardHead title="Two-factor authentication" />
        <div className="px-5 pb-5"><Skeleton className="h-24" /></div>
      </Card>
    );
  }

  const on = status.data?.enabled;
  const remaining = status.data?.recoveryCodesRemaining ?? 0;
  const supportsRecovery = on && remaining > 0;

  return (
    <Card>
      <CardHead
        title="Two-factor authentication"
        subtitle={subtitle}
        right={<Badge tone={on ? 'good' : emphasis ? 'bad' : 'neutral'}>{on ? 'On' : 'Off'}</Badge>}
      />
      <div className="space-y-3 px-5 pb-5">
        {step === 'codes' ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-[5px] border border-warn/30 bg-warn-soft px-3.5 py-3">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
              <p className="text-[12.5px] leading-relaxed text-ink">
                Save these now. Each works once, and they are the only way back in if you lose your
                phone. <strong>They will not be shown again.</strong>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 rounded-[5px] border border-line bg-canvas p-3 font-mono text-[12.5px] text-ink">
              {codes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={copyCodes}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy codes'}
              </Button>
              <Button type="button" onClick={() => { setStep('idle'); setCodes([]); }}>
                I have saved them
              </Button>
            </div>
          </div>
        ) : on ? (
          <>
            <div className="flex items-start gap-3 rounded-[5px] border border-line bg-canvas px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[4px] bg-good-soft text-good">
                <ShieldCheck size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink">Protected</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
                  {status.data?.enabledAt
                    ? `On since ${new Date(status.data.enabledAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.`
                    : 'Enabled.'}
                  {supportsRecovery && ` ${remaining} recovery code${remaining === 1 ? '' : 's'} left.`}
                </p>
                {supportsRecovery && remaining <= 3 && (
                  <p className="mt-1 text-[11.5px] text-warn">
                    Running low — generate a fresh set before you run out.
                  </p>
                )}
              </div>
            </div>

            {step === 'password' ? (
              <form className="space-y-2.5" onSubmit={(e) => { e.preventDefault(); disable.mutate(); }}>
                <input type="password" placeholder="Your password" value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)} className={`${controlCls} h-11 w-full`} />
                <input inputMode="numeric" placeholder="Authenticator or recovery code" value={code}
                  onChange={(e) => setCode(e.target.value)} className={`${controlCls} h-11 w-full`} />
                <div className="flex gap-2">
                  <Button type="submit" variant="danger" loading={disable.isPending} disabled={!password || !code}>
                    Turn off
                  </Button>
                  <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
                </div>
              </form>
            ) : step === 'scan' ? (
              <form className="space-y-2.5" onSubmit={(e) => { e.preventDefault(); regenerate.mutate(); }}>
                <p className="text-[12.5px] text-ink-2">
                  Confirm your password and a current code to replace every recovery code.
                </p>
                <input type="password" placeholder="Your password" value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)} className={`${controlCls} h-11 w-full`} />
                <input inputMode="numeric" maxLength={6} placeholder="000000" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className={`${controlCls} h-11 w-full max-w-[180px] text-center font-mono tracking-[0.3em]`} />
                <div className="flex gap-2">
                  <Button type="submit" loading={regenerate.isPending} disabled={!password || code.length !== 6}>
                    Generate new codes
                  </Button>
                  <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setStep('password')}>
                  Turn off two-factor
                </Button>
                {supportsRecovery && (
                  <Button type="button" variant="outline" onClick={() => { setStep('scan'); setPassword(''); setCode(''); }}>
                    <KeyRound size={14} /> New recovery codes
                  </Button>
                )}
              </div>
            )}
          </>
        ) : step === 'scan' && setup ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); confirm.mutate(); }}>
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              Scan this with Google Authenticator, 1Password, Authy or similar, then enter the
              6-digit code it shows.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Image src={setup.qrDataUrl} alt="Two-factor QR code" width={150} height={150}
                unoptimized className="rounded-[5px] border border-line bg-white p-1.5" />
              <div className="min-w-0">
                <p className="text-[11.5px] uppercase tracking-[0.04em] text-ink-3">Or enter this key</p>
                <p className="mt-1 break-all font-mono text-[12.5px] text-ink">{setup.secret}</p>
              </div>
            </div>
            <input inputMode="numeric" maxLength={6} placeholder="000000" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${controlCls} h-11 w-full max-w-[180px] text-center font-mono text-[16px] tracking-[0.3em]`} />
            <div className="flex gap-2">
              <Button type="submit" loading={confirm.isPending} disabled={code.length !== 6}>Turn on</Button>
              <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
            </div>
          </form>
        ) : step === 'password' ? (
          <form className="space-y-2.5" onSubmit={(e) => { e.preventDefault(); begin.mutate(); }}>
            <p className="text-[12.5px] text-ink-2">Confirm your password to begin.</p>
            <input type="password" placeholder="Your password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} className={`${controlCls} h-11 w-full`} />
            <div className="flex gap-2">
              <Button type="submit" loading={begin.isPending} disabled={!password}>Continue</Button>
              <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
            </div>
          </form>
        ) : (
          <>
            <div className={`flex items-start gap-3 rounded-[5px] border px-4 py-3.5 ${
              emphasis ? 'border-bad/30 bg-bad-soft' : 'border-line bg-canvas'}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[4px] ${
                emphasis ? 'bg-bad/15 text-bad' : 'bg-warn-soft text-warn'}`}>
                <ShieldAlert size={17} />
              </span>
              <div>
                <p className="text-[13.5px] font-medium text-ink">Not protected</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
                  {emphasis
                    ? 'This account can adjust balances and approve payouts. A password alone is the only thing standing in the way.'
                    : 'Anyone with your password can sign in. With two-factor on, they would also need your phone.'}
                </p>
              </div>
            </div>
            <Button type="button" onClick={() => setStep('password')}>
              <KeyRound size={14} /> Turn on two-factor
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
