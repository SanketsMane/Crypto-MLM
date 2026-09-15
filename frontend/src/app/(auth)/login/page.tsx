'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { useLogin, useTwoFactorChallenge } from '@/features/auth/use-auth';
import { Field, Notice, PasswordInput, SubmitButton, TextInput } from '@/components/auth/fields';
import { apiErrorMessage } from '@/lib/api';

/** Messages other flows redirect here with. Without these, a member who has
 *  just reset their password lands on a bare form with no confirmation that
 *  anything happened. */
const ARRIVALS: Record<string, { tone: 'good' | 'info'; title: string; body: string }> = {
  reset: { tone: 'good', title: 'Password updated', body: 'Sign in with your new password. Any other sessions you had open were ended.' },
  registered: { tone: 'good', title: 'Account created', body: 'Sign in to continue to your dashboard.' },
  verified: { tone: 'good', title: 'Email verified', body: 'Thanks — your email address is confirmed.' },
  expired: { tone: 'info', title: 'Session ended', body: 'You were signed out because your session expired. Sign in to continue.' },
  loggedout: { tone: 'info', title: 'Signed out', body: 'You have been signed out on this device.' },
};

function LoginForm() {
  const params = useSearchParams();
  const [emailOrCode, setEmailOrCode] = useState('');
  const [password, setPassword] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  const login = useLogin(setChallengeToken);
  const arrival = ARRIVALS[[...Object.keys(ARRIVALS)].find((k) => params.get(k) === '1') ?? ''];

  /* Two-factor is a second screen rather than a second field: showing a code
     box before the password is checked would tell an attacker which accounts
     have it turned on. */
  if (challengeToken) {
    return <TwoFactorStep challengeToken={challengeToken} onCancel={() => setChallengeToken(null)} />;
  }

  return (
    <>
      <header className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">Welcome back</h1>
        <p className="mt-1.5 text-[14px] text-white/55">
          Sign in to see your positions and earnings.
        </p>
      </header>

      {arrival && (
        <div className="mb-5">
          <Notice tone={arrival.tone} title={arrival.title}>{arrival.body}</Notice>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); login.mutate({ emailOrCode, password }); }}
        className="space-y-4"
      >
        <Field label="Email or member ID">
          <TextInput
            value={emailOrCode}
            onChange={(e) => setEmailOrCode(e.target.value)}
            required autoFocus autoComplete="username"
            placeholder="you@example.com or FX1A2B3C"
            invalid={login.isError}
          />
        </Field>

        <div>
          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required autoComplete="current-password"
              placeholder="Your password"
              invalid={login.isError}
            />
          </Field>
          <div className="mt-2 text-right">
            <Link href="/forgot-password" className="text-[12.5px] text-white/50 transition hover:text-brand-gold">
              Forgot your password?
            </Link>
          </div>
        </div>

        {login.isError && <Notice tone="bad">{apiErrorMessage(login.error)}</Notice>}

        <SubmitButton loading={login.isPending} disabled={!emailOrCode || !password}>
          Sign in <ArrowRight size={15} strokeWidth={2.4} />
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-[13.5px] text-white/50">
        New here?{' '}
        <Link href="/register" className="font-medium text-brand-gold transition hover:underline">
          Create an account
        </Link>
      </p>

      <p className="mt-8 flex items-start gap-2 rounded-[5px] border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-[11.5px] leading-relaxed text-white/58">
        <ShieldCheck size={14} className="mt-px shrink-0 text-white/55" />
        We will never ask for your password, a recovery phrase or a one-time code by email,
        chat or phone.
      </p>
    </>
  );
}

function TwoFactorStep({ challengeToken, onCancel }: { challengeToken: string; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const challenge = useTwoFactorChallenge();
  const ready = useRecovery ? code.length >= 11 : code.length === 6;

  return (
    <>
      <header className="mb-7">
        <span className="grid h-11 w-11 place-items-center rounded-[5px] border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
          <KeyRound size={19} strokeWidth={1.9} />
        </span>
        <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.02em] text-white">Two-factor required</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-white/55">
          {useRecovery
            ? 'Enter one of the recovery codes you saved when you turned two-factor on.'
            : 'Enter the six-digit code from your authenticator app to finish signing in.'}
        </p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); challenge.mutate({ challengeToken, code }); }} className="space-y-4">
        <Field label={useRecovery ? 'Recovery code' : 'Authentication code'}>
          <TextInput
            value={code}
            onChange={(e) => setCode(useRecovery ? e.target.value.trim() : e.target.value.replace(/\D/g, ''))}
            inputMode={useRecovery ? 'text' : 'numeric'}
            maxLength={useRecovery ? 11 : 6}
            autoFocus autoComplete="one-time-code"
            placeholder={useRecovery ? '00000-00000' : '000000'}
            invalid={challenge.isError}
            className="text-center font-mono text-[18px] tracking-[0.35em]"
          />
        </Field>

        {challenge.isError && <Notice tone="bad">{apiErrorMessage(challenge.error)}</Notice>}

        <SubmitButton loading={challenge.isPending} disabled={!ready}>Verify and sign in</SubmitButton>
      </form>

      <div className="mt-6 flex items-center justify-between text-[12.5px]">
        <button type="button" onClick={() => { setUseRecovery((v) => !v); setCode(''); }}
                className="text-white/50 transition hover:text-brand-gold">
          {useRecovery ? 'Use authenticator app instead' : 'Lost your phone?'}
        </button>
        <button type="button" onClick={onCancel} className="text-white/50 transition hover:text-white">
          Back to sign in
        </button>
      </div>
    </>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense fallback={<div className="h-[360px] animate-pulse rounded-[5px] bg-white/[0.03]" />}>
      <LoginForm />
    </Suspense>
  );
}
