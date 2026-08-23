'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { post, apiErrorMessage } from '@/lib/api';
import { Field, Notice, PasswordInput, PasswordStrength, SubmitButton, TextInput, scorePassword } from '@/components/auth/fields';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const request = useMutation({
    mutationFn: () => post<{ challengeId: string }>('/auth/forgot-password', { email }),
    onSuccess: (d) => setChallengeId(d.challengeId),
  });

  const reset = useMutation({
    mutationFn: () => post('/auth/reset-password', { challengeId, code, newPassword }),
    onSuccess: () => router.push('/login?reset=1'),
  });

  const strength = scorePassword(newPassword);
  const tooWeak = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  const ready = code.length === 6 && newPassword.length >= 8 && confirm === newPassword;

  /* ── step one: ask for the address ── */
  if (!challengeId) {
    return (
      <>
        <header className="mb-7">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">Reset your password</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-white/55">
            Tell us the email on your account and we will send a six-digit code to set a new one.
          </p>
        </header>

        <form onSubmit={(e) => { e.preventDefault(); request.mutate(); }} className="space-y-4">
          <Field label="Email address">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                       required autoFocus autoComplete="email" placeholder="you@example.com"
                       invalid={request.isError} />
          </Field>

          {request.isError && <Notice tone="bad">{apiErrorMessage(request.error)}</Notice>}

          <SubmitButton loading={request.isPending} disabled={!email}>Send the code</SubmitButton>
        </form>

        <p className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-[13.5px] text-white/50 transition hover:text-white">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </p>
      </>
    );
  }

  /* ── step two: code and new password ── */
  return (
    <>
      <header className="mb-7">
        <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
          <MailCheck size={19} strokeWidth={1.9} />
        </span>
        <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.02em] text-white">Check your email</h1>
        {/* Deliberately unconditional: whether an account exists for this
            address is not something an anonymous visitor gets to learn. */}
        <p className="mt-1.5 text-[14px] leading-relaxed text-white/55">
          If an account exists for <span className="text-white">{email}</span>, a six-digit code is
          on its way. It expires shortly, so use it soon.
        </p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); reset.mutate(); }} className="space-y-4">
        <Field label="Verification code">
          <TextInput value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                     inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code"
                     placeholder="000000" invalid={reset.isError}
                     className="text-center font-mono text-[18px] tracking-[0.35em]" />
        </Field>

        <div>
          <Field label="New password" error={tooWeak ? 'At least 8 characters.' : undefined}>
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                           autoComplete="new-password" placeholder="At least 8 characters" invalid={tooWeak} />
          </Field>
          <PasswordStrength password={newPassword} />
        </div>

        <Field label="Confirm new password" error={mismatch ? 'These do not match.' : undefined}>
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)}
                         autoComplete="new-password" placeholder="Type it again" invalid={mismatch} />
        </Field>

        {reset.isError && <Notice tone="bad">{apiErrorMessage(reset.error)}</Notice>}

        <SubmitButton loading={reset.isPending} disabled={!ready}>Set new password</SubmitButton>

        <p className="text-center text-[11.5px] leading-relaxed text-white/55">
          Setting a new password ends every other session on your account.
          {strength.score < 2 && newPassword.length >= 8 && ' Consider a longer passphrase — length matters more than symbols.'}
        </p>
      </form>

      <div className="mt-6 flex items-center justify-between text-[13px]">
        <button type="button" onClick={() => { setChallengeId(null); setCode(''); }}
                className="text-white/50 transition hover:text-white">Use a different email</button>
        <Link href="/login" className="text-white/50 transition hover:text-white">Back to sign in</Link>
      </div>
    </>
  );
}
