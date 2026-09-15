'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, KeyRound, ScrollText, ShieldCheck, UserCog } from 'lucide-react';
import { adminApi, adminToken } from '@/lib/admin-api';
import { toFriendlyError } from '@/lib/errors';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { BrandMark } from '@/components/layout/brand-mark';
import {
  Field, Notice, PasswordInput, SubmitButton, TextInput, useFieldId,
} from '@/components/auth/fields';

/**
 * The operations console sign-in.
 *
 * A split screen rather than a card floating in an empty page, matching the
 * member sign-in's architecture so the two read as one product — but the panel
 * carries a different message. The member panel sells the plan; nobody arriving
 * here needs selling. What an operator needs to know before they type a
 * password is what this console can reach and what it records about them.
 *
 * The security posture on the left is not decoration. Stating that every action
 * is attributed, and that access is scoped by role, is the honest framing for a
 * screen that opens onto other people's money — and it is a deterrent that
 * costs nothing.
 */

const ACCOUNTABILITY = [
  { Icon: ScrollText, text: 'Every action is recorded with the operator, the time and what changed' },
  { Icon: UserCog, text: 'Access is scoped by role — you can reach only what your role grants' },
  { Icon: KeyRound, text: 'Sessions are individually revocable, and two-factor is supported' },
];

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const emailId = useFieldId('email');
  const passwordId = useFieldId('password');
  const codeId = useFieldId('code');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await adminApi.post('/admin/login', { email, password });
      // With a second factor enrolled the password alone returns a ticket, not
      // a session — the console stays shut until the code checks out.
      if (data.data.twoFactorRequired) {
        setChallenge(data.data.challengeToken);
        return;
      }
      adminToken.set(data.data.accessToken, data.data.refreshToken);
      router.replace('/admin');
    } catch (err) {
      /**
       * The server's own sentence, not a blanket "Invalid credentials".
       *
       * That is what this used to show for every failure, including the lockout
       * — which returns "Too many failed sign-in attempts. Try again in 8
       * minutes." An operator told only that their password was wrong keeps
       * trying, and every attempt doubles the lock window they cannot see.
       */
      setError(toFriendlyError(err).message);
    } finally { setBusy(false); }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await adminApi.post('/admin/2fa/challenge', { challengeToken: challenge, code });
      adminToken.set(data.data.accessToken, data.data.refreshToken);
      router.replace('/admin');
    } catch (err) {
      setError(toFriendlyError(err).message);
      setCode('');
    } finally { setBusy(false); }
  };

  return (
    <div data-site className="flex min-h-screen bg-navy-deep text-white [color-scheme:dark]">
      {/* ── accountability panel ── */}
      <aside className="relative isolate hidden w-[46%] max-w-[620px] shrink-0 overflow-hidden border-r border-white/[0.07] lg:block">
        {/* The promotional render that sat here was the previous brand's
            artwork. There is no operator equivalent to swap in, so the panel
            carries one off-centre wash of the accent instead. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(64%_58%_at_18%_0%,color-mix(in_srgb,var(--color-gold)_12%,transparent),transparent_72%)]" />
        {/* Heavy enough to keep the copy legible, light enough that the
            artwork still reads as texture. At 92% it washed out to a flat
            panel, which loses the brand and gains nothing. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-navy-deep/88 via-navy-deep/72 to-navy-deep/94" />

        <div className="flex h-full flex-col justify-between p-10 xl:p-12">
          <Link href="/" className="block w-fit" aria-label="Home">
          <BrandMark ink="onDark" />
        </Link>

          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand-gold">
              Operations console
            </p>
            <h1 className="mt-4 max-w-[18ch] text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-white xl:text-[34px]">
              Restricted to authorised operators
            </h1>
            <p className="mt-4 max-w-[42ch] text-[14px] leading-[1.75] text-white/60">
              This console approves withdrawals, confirms deposits, adjusts balances and
              reads identity documents. Everything done here is attributable.
            </p>

            <ul className="mt-8 space-y-3.5">
              {ACCOUNTABILITY.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-[13.5px] leading-relaxed text-white/65">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[4px] border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
                    <Icon size={14} strokeWidth={2} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[12px] leading-relaxed text-white/55">
            Sign-in attempts are logged with the time and originating address. If you
            reached this page by mistake, there is nothing here for you.
          </p>
        </div>
      </aside>

      {/* ── form column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="block w-fit lg:hidden" aria-label="Home">
          <BrandMark ink="onDark" />
        </Link>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/"
                  className="inline-flex items-center gap-1.5 text-[13px] text-white/58 transition hover:text-white">
              <ArrowLeft size={14} /> Back to site
            </Link>
            {/* Reachable before sign-in: the preference is the browser's, not
                the account's, so it has to work with no session. */}
            <ThemeToggle />
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-16 sm:px-8">
          <div className="w-full max-w-[400px]">
            <div className="mb-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/25 bg-brand-gold/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-gold">
                <ShieldCheck size={12} strokeWidth={2.4} />
                {challenge ? 'Second factor' : 'Staff access'}
              </span>

              <h2 className="mt-4 text-[26px] font-semibold tracking-[-0.02em] text-white">
                {challenge ? 'Confirm it is you' : 'Sign in to the console'}
              </h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-white/58">
                {challenge
                  ? 'Your password was accepted. Enter the six-digit code from your authenticator app to open the console.'
                  : 'Operator accounts are created by a Super Admin. There is no sign-up.'}
              </p>
            </div>

            <form onSubmit={challenge ? verify : submit} className="space-y-4" noValidate>
              {challenge ? (
                <Field label="Authentication code" htmlFor={codeId}
                       hint="Six digits, from the app you enrolled when two-factor was set up">
                  <TextInput
                    id={codeId}
                    inputMode="numeric"
                    maxLength={6}
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="text-center font-mono text-[18px] tracking-[0.4em]"
                  />
                </Field>
              ) : (
                <>
                  <Field label="Work email" htmlFor={emailId}>
                    <TextInput
                      id={emailId}
                      type="email"
                      required
                      autoFocus
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </Field>

                  {/* PasswordInput carries the reveal toggle and the caps-lock
                      warning — the commonest cause of "my password stopped
                      working", and invisible while the characters are dots. */}
                  <Field label="Password" htmlFor={passwordId}>
                    <PasswordInput
                      id={passwordId}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                    />
                  </Field>
                </>
              )}

              {error && <Notice tone="bad">{error}</Notice>}

              <SubmitButton
                loading={busy}
                disabled={challenge ? code.length !== 6 : !email || !password}
              >
                {challenge ? 'Open the console' : 'Sign in'}
                {!busy && <ArrowRight size={15} strokeWidth={2.4} />}
              </SubmitButton>

              {challenge && (
                <button
                  type="button"
                  onClick={() => { setChallenge(null); setCode(''); setError(''); setPassword(''); }}
                  className="w-full rounded-[4px] py-1.5 text-center text-[12.5px] text-white/58 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Use a different account
                </button>
              )}
            </form>

            <p className="mt-8 flex items-start gap-2.5 rounded-[5px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-[12px] leading-relaxed text-white/58">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-white/40" />
              Our staff will never ask for your console password or a two-factor code.
              If someone has, stop and report it.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
