'use client';

import { useId, useState } from 'react';
import { clsx } from 'clsx';
import { AlertCircle, Check, Eye, EyeOff, Loader2 } from 'lucide-react';

/* Form controls shared by sign-in, registration and password reset.
   Auth screens carry the highest stakes per keystroke on the platform, so the
   feedback here is deliberately louder than in the rest of the app. */

const base =
  'w-full rounded-[10px] border bg-navy-deep/60 px-3.5 py-3 text-[14px] text-white outline-none ' +
  'transition placeholder:text-white/25 disabled:opacity-50';
const ok = 'border-white/12 focus:border-brand-gold/60 focus:ring-4 focus:ring-brand-gold/12';
const bad = 'border-bad/60 focus:border-bad focus:ring-4 focus:ring-bad/15';

export function Field({
  label, hint, error, optional, children, htmlFor,
}: {
  label: string; hint?: string; error?: string; optional?: boolean;
  children: React.ReactNode; htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-white/75">{label}</span>
        {optional && <span className="text-[11.5px] text-white/35">Optional</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-bad">
          <AlertCircle size={12} /> {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[11.5px] text-white/40">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({
  invalid, className, ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} aria-invalid={invalid || undefined} className={clsx(base, invalid ? bad : ok, className)} />;
}

/**
 * Password input with a reveal toggle and a caps-lock warning.
 *
 * Caps lock is the single most common cause of "my password stopped working",
 * and the user cannot see it while the characters are dots.
 */
export function PasswordInput({
  invalid, className, value, onChange, ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);

  return (
    <span className="block">
      <span className="relative block">
        <input
          {...rest}
          value={value}
          onChange={onChange}
          type={shown ? 'text' : 'password'}
          aria-invalid={invalid || undefined}
          onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
          onBlur={() => setCaps(false)}
          className={clsx(base, invalid ? bad : ok, 'pr-11', className)}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          tabIndex={-1}
          className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-white/40 transition hover:bg-white/[0.06] hover:text-white"
        >
          {shown ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
      {caps && (
        <span className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-warn">
          <AlertCircle size={12} /> Caps Lock is on
        </span>
      )}
    </span>
  );
}

/* ── password strength ──────────────────────────────────────────────────
   Scored on what actually resists guessing — length first, variety second —
   rather than a checklist that rewards "Password1!". */

export interface Strength { score: 0 | 1 | 2 | 3 | 4; label: string; met: { rule: string; ok: boolean }[] }

export function scorePassword(pw: string): Strength {
  const met = [
    { rule: 'At least 8 characters', ok: pw.length >= 8 },
    { rule: 'Upper and lower case', ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { rule: 'A number', ok: /\d/.test(pw) },
    { rule: 'A symbol', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  if (!pw) return { score: 0, label: '', met };

  let score = met.filter((m) => m.ok).length;
  if (pw.length >= 14) score += 1;                       // length beats variety
  if (/^[a-z]+$/i.test(pw) || /^\d+$/.test(pw)) score -= 1;
  if (/(.)\1{2,}/.test(pw)) score -= 1;                  // aaa, 111
  if (/^(password|qwerty|letmein|welcome|fortunex)/i.test(pw)) score = 0;

  const clamped = Math.max(0, Math.min(4, score)) as Strength['score'];
  return { score: clamped, label: ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][clamped], met };
}

export function PasswordStrength({ password }: { password: string }) {
  const { score, label, met } = scorePassword(password);
  if (!password) return null;

  const colour = ['bg-bad', 'bg-bad', 'bg-warn', 'bg-good', 'bg-good'][score];

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" role="img" aria-label={`Password strength: ${label}`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i}
                  className={clsx('h-1 flex-1 rounded-full transition-colors duration-300',
                    i < Math.max(1, score) && password ? colour : 'bg-white/10')} />
          ))}
        </div>
        <span className={clsx('text-[11.5px] font-medium tabular-nums',
          score >= 3 ? 'text-good' : score === 2 ? 'text-warn' : 'text-bad')}>
          {label}
        </span>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {met.map((m) => (
          <li key={m.rule} className={clsx('flex items-center gap-1.5 text-[11px]', m.ok ? 'text-white/55' : 'text-white/30')}>
            <Check size={11} className={m.ok ? 'text-good' : 'text-white/20'} />
            {m.rule}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── feedback ─────────────────────────────────────────────────────────── */

export function Notice({
  tone = 'info', title, children,
}: { tone?: 'info' | 'good' | 'bad'; title?: string; children: React.ReactNode }) {
  const styles = {
    info: 'border-white/12 bg-white/[0.04] text-white/70',
    good: 'border-good/30 bg-good/10 text-white',
    bad: 'border-bad/35 bg-bad/10 text-white',
  }[tone];

  return (
    <div role={tone === 'bad' ? 'alert' : 'status'}
         className={clsx('rounded-[10px] border px-3.5 py-3 text-[12.5px] leading-relaxed', styles)}>
      {title && <p className="font-medium">{title}</p>}
      <p className={clsx(title && 'mt-0.5 text-white/70')}>{children}</p>
    </div>
  );
}

/** The primary action on an auth form. */
export function SubmitButton({
  loading, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      type="submit"
      disabled={rest.disabled || loading}
      className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] bg-[linear-gradient(135deg,#D4AF37_0%,#C49A2C_100%)] px-6 py-3.5 text-[14.5px] font-semibold text-navy transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

/** A stable id for a field/label pair. */
export const useFieldId = (name: string) => `${name}-${useId()}`;
