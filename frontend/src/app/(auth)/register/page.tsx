'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useRegister } from '@/features/auth/use-auth';
import { usePlatformConfig } from '@/features/config/use-config';
import { Field, Notice, PasswordInput, PasswordStrength, SubmitButton, TextInput, scorePassword } from '@/components/auth/fields';
import { SponsorFeedback, useSponsorCheck } from '@/components/auth/sponsor-check';
import { apiErrorMessage } from '@/lib/api';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

function RegisterForm() {
  const params = useSearchParams();
  const register = useRegister();
  const cfg = usePlatformConfig();

  /**
   * Registration can be closed by an operator. Showing the form anyway and
   * failing on submit wastes someone's time filling it in.
   */
  const closed = cfg.data?.platform.registrationOpen === false;

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    password: '', confirm: '', walletAddress: '',
    sponsorCode: (params.get('ref') ?? '').toUpperCase(),
  });
  const [accepted, setAccepted] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === 'sponsorCode' ? e.target.value.toUpperCase() : e.target.value }));
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));

  const sponsor = useSponsorCheck(form.sponsorCode);
  const strength = scorePassword(form.password);

  /* Errors surface once a field has been left, not while it is being typed. */
  const errors = {
    firstName: touched.firstName && form.firstName.trim().length < 2 ? 'Enter at least two characters.' : undefined,
    email: touched.email && !EMAIL_RE.test(form.email.trim()) ? 'Enter a valid email address.' : undefined,
    password: touched.password && form.password.length < 8 ? 'At least 8 characters.' : undefined,
    confirm: touched.confirm && form.confirm !== form.password ? 'These do not match.' : undefined,
    walletAddress:
      touched.walletAddress && form.walletAddress && !WALLET_RE.test(form.walletAddress.trim())
        ? 'That is not a valid BEP-20 address.' : undefined,
  };

  const ready =
    form.firstName.trim().length >= 2 &&
    EMAIL_RE.test(form.email.trim()) &&
    form.password.length >= 8 &&
    form.confirm === form.password &&
    (!form.walletAddress || WALLET_RE.test(form.walletAddress.trim())) &&
    sponsor.status !== 'missing' &&
    accepted;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ firstName: true, email: true, password: true, confirm: true, walletAddress: true });
    if (!ready) return;

    // Only send what the member actually filled in — empty optional strings
    // would fail validation that expects them absent.
    const body: Record<string, string> = {
      firstName: form.firstName.trim(),
      email: form.email.trim(),
      password: form.password,
    };
    if (form.lastName.trim()) body.lastName = form.lastName.trim();
    if (form.phone.trim()) body.phone = form.phone.trim();
    if (form.walletAddress.trim()) body.walletAddress = form.walletAddress.trim();
    if (form.sponsorCode.trim()) body.sponsorCode = form.sponsorCode.trim();

    register.mutate(body);
  };

  if (closed) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-7 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
          Registration is closed
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-white/55">
          New sign-ups are paused at the moment. Existing members can still sign in normally.
        </p>
        <Link href="/login"
              className="mt-5 inline-block rounded-lg bg-brand-gold px-4 py-2.5 text-[14px] font-semibold text-navy transition hover:brightness-105">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">Create your account</h1>
        <p className="mt-1.5 text-[14px] text-white/55">
          Takes a minute. You can fund it and choose a tier straight afterwards.
        </p>
      </header>

      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName}>
            <TextInput value={form.firstName} onChange={set('firstName')} onBlur={blur('firstName')}
                       autoComplete="given-name" placeholder="Priya" autoFocus invalid={!!errors.firstName} />
          </Field>
          <Field label="Last name" optional>
            <TextInput value={form.lastName} onChange={set('lastName')} autoComplete="family-name" placeholder="Sharma" />
          </Field>
        </div>

        <Field label="Email address" error={errors.email}
               hint="Used for sign-in, security alerts and withdrawal confirmations.">
          <TextInput type="email" value={form.email} onChange={set('email')} onBlur={blur('email')}
                     autoComplete="email" placeholder="you@example.com" invalid={!!errors.email} />
        </Field>

        <div>
          <Field label="Password" error={errors.password}>
            <PasswordInput value={form.password} onChange={set('password')} onBlur={blur('password')}
                           autoComplete="new-password" placeholder="At least 8 characters"
                           invalid={!!errors.password} />
          </Field>
          <PasswordStrength password={form.password} />
        </div>

        <Field label="Confirm password" error={errors.confirm}>
          <PasswordInput value={form.confirm} onChange={set('confirm')} onBlur={blur('confirm')}
                         autoComplete="new-password" placeholder="Type it again" invalid={!!errors.confirm} />
        </Field>

        <div>
          <Field label="Sponsor code" optional
                 hint={sponsor.status === 'empty' ? 'Places you in the network of the member who invited you. This cannot be changed later.' : undefined}>
            <TextInput value={form.sponsorCode} onChange={set('sponsorCode')}
                       placeholder="FX1A2B3C" className="font-mono tracking-wider"
                       invalid={sponsor.status === 'missing'} />
          </Field>
          <SponsorFeedback state={sponsor} />
        </div>

        {/* Optional details, folded away — asking for a payout address before
            someone has an account is friction they do not need yet. */}
        <div className="rounded-[10px] border border-white/[0.07]">
          <button type="button" onClick={() => setShowMore((v) => !v)}
                  aria-expanded={showMore}
                  className="flex w-full items-center justify-between px-3.5 py-3 text-[13px] text-white/60 transition hover:text-white">
            Add phone and payout address
            <ChevronDown size={15} className={clsx('transition-transform', showMore && 'rotate-180')} />
          </button>
          {showMore && (
            <div className="space-y-4 border-t border-white/[0.07] p-3.5">
              <Field label="Phone" optional>
                <TextInput value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+971 …" />
              </Field>
              <Field label="USDT payout address" optional error={errors.walletAddress}
                     hint="BEP-20 only. You can add or change this later in your profile.">
                <TextInput value={form.walletAddress} onChange={set('walletAddress')} onBlur={blur('walletAddress')}
                           placeholder="0x…" className="font-mono text-[13px]" invalid={!!errors.walletAddress} />
              </Field>
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-3 pt-1">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
                 className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37]" />
          <span className="text-[12.5px] leading-relaxed text-white/55">
            I have read the{' '}
            <Link href="/legal/terms" target="_blank" className="text-brand-gold underline underline-offset-2">terms of service</Link>,{' '}
            <Link href="/legal/privacy" target="_blank" className="text-brand-gold underline underline-offset-2">privacy policy</Link>{' '}
            and{' '}
            <Link href="/legal/risk-disclosure" target="_blank" className="text-brand-gold underline underline-offset-2">risk disclosure</Link>,
            and I understand that trading carries risk including loss of capital.
          </span>
        </label>

        {register.isError && <Notice tone="bad">{apiErrorMessage(register.error)}</Notice>}

        <SubmitButton loading={register.isPending} disabled={!ready}>
          Create account <ArrowRight size={15} strokeWidth={2.4} />
        </SubmitButton>

        {!accepted && strength.score >= 2 && (
          <p className="text-center text-[11.5px] text-white/35">Accept the terms above to continue.</p>
        )}
      </form>

      <p className="mt-6 text-center text-[13.5px] text-white/50">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-gold transition hover:underline">Sign in</Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="h-[520px] animate-pulse rounded-2xl bg-white/[0.03]" />}>
      <RegisterForm />
    </Suspense>
  );
}
