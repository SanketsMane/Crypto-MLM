'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useRegister } from '@/features/auth/use-auth';
import { usePlatformConfig } from '@/features/config/use-config';
import { Field, Notice, PasswordInput, PasswordStrength, SubmitButton, TextInput, scorePassword } from '@/components/auth/fields';
import { SponsorFeedback, useSponsorCheck } from '@/components/auth/sponsor-check';
import { apiErrorMessage } from '@/lib/api';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Registration.
 *
 * No payout address here. It is optional on the API and can be set from the
 * profile later, and asking someone for a wallet before they have an account
 * is friction at the worst possible moment — so the field is gone rather than
 * folded away behind a disclosure.
 *
 * Paired fields sit two-up so the whole form clears a laptop viewport without
 * scrolling; the shell caps itself to the viewport height and lets this column
 * scroll internally on the short screens where that is unavoidable.
 */
function RegisterForm() {
  const params = useSearchParams();
  const register = useRegister();
  const cfg = usePlatformConfig();

  /* Registration can be closed by an operator. Showing the form anyway and
     failing on submit wastes someone's time filling it in. */
  const closed = cfg.data?.platform.registrationOpen === false;

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    password: '', confirm: '',
    sponsorCode: (params.get('ref') ?? '').toUpperCase(),
  });
  const [accepted, setAccepted] = useState(false);
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
  };

  const ready =
    form.firstName.trim().length >= 2 &&
    EMAIL_RE.test(form.email.trim()) &&
    form.password.length >= 8 &&
    form.confirm === form.password &&
    sponsor.status !== 'missing' &&
    accepted;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ firstName: true, email: true, password: true, confirm: true });
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
    if (form.sponsorCode.trim()) body.sponsorCode = form.sponsorCode.trim();

    register.mutate(body);
  };

  if (closed) {
    return (
      <div className="rounded-[5px] border border-white/10 bg-white/[0.04] p-7 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-white">Registration is closed</h1>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-white/55">
          New sign-ups are paused at the moment. Existing members can still sign in normally.
        </p>
        <Link href="/login"
              className="mt-5 inline-block rounded-[4px] bg-[#FF7A1A] px-4 py-2.5 text-[14px] font-semibold text-black transition hover:brightness-105">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[25px] font-semibold tracking-[-0.02em] text-white">Create your account</h1>
        <p className="mt-1 text-[13.5px] text-white/55">
          Takes a minute. You can fund it and choose a tier straight afterwards.
        </p>
      </header>

      <form onSubmit={submit} noValidate className="space-y-3.5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName}>
            <TextInput value={form.firstName} onChange={set('firstName')} onBlur={blur('firstName')}
                       autoComplete="given-name" placeholder="Priya" autoFocus invalid={!!errors.firstName} />
          </Field>
          <Field label="Last name" optional>
            <TextInput value={form.lastName} onChange={set('lastName')} autoComplete="family-name" placeholder="Sharma" />
          </Field>
        </div>

        <Field label="Email address" error={errors.email}>
          <TextInput type="email" value={form.email} onChange={set('email')} onBlur={blur('email')}
                     autoComplete="email" placeholder="you@example.com" invalid={!!errors.email} />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Password" error={errors.password}>
            <PasswordInput value={form.password} onChange={set('password')} onBlur={blur('password')}
                           autoComplete="new-password" placeholder="8+ characters"
                           invalid={!!errors.password} />
          </Field>
          <Field label="Confirm password" error={errors.confirm}>
            <PasswordInput value={form.confirm} onChange={set('confirm')} onBlur={blur('confirm')}
                           autoComplete="new-password" placeholder="Type it again" invalid={!!errors.confirm} />
          </Field>
        </div>

        {/* only takes up room once there is something to report on */}
        <PasswordStrength password={form.password} />

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <Field label="Sponsor code" optional>
              <TextInput value={form.sponsorCode} onChange={set('sponsorCode')}
                         placeholder="FX1A2B3C" className="font-mono tracking-wider"
                         invalid={sponsor.status === 'missing'} />
            </Field>
            <SponsorFeedback state={sponsor} />
          </div>
          <Field label="Phone" optional>
            <TextInput value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+971 …" />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 pt-0.5">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
                 className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF7A1A]" />
          <span className="text-[12px] leading-[1.6] text-white/55">
            I accept the{' '}
            <Link href="/legal/terms" target="_blank" className="text-[#FF7A1A] underline underline-offset-2">terms</Link>,{' '}
            <Link href="/legal/privacy" target="_blank" className="text-[#FF7A1A] underline underline-offset-2">privacy policy</Link>{' '}
            and{' '}
            <Link href="/legal/risk-disclosure" target="_blank" className="text-[#FF7A1A] underline underline-offset-2">risk disclosure</Link>,
            and understand that trading carries risk including loss of capital.
          </span>
        </label>

        {register.isError && <Notice tone="bad">{apiErrorMessage(register.error)}</Notice>}

        <SubmitButton loading={register.isPending} disabled={!ready}>
          Create account <ArrowRight size={15} strokeWidth={2.4} />
        </SubmitButton>

        {!accepted && strength.score >= 2 && (
          <p className="text-center text-[11.5px] text-white/55">Accept the terms above to continue.</p>
        )}
      </form>

      <p className="mt-4 text-center text-[13px] text-white/50">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-[#FF7A1A] transition hover:underline">Sign in</Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="h-[520px] animate-pulse rounded-[5px] bg-white/[0.03]" />}>
      <RegisterForm />
    </Suspense>
  );
}
