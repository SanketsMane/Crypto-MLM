'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { adminApi, adminToken } from '@/lib/admin-api';
import { Button } from '@/components/ui/primitives';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

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
    } catch {
      setError('Invalid credentials');
    } finally { setBusy(false); }
  };

  const field =
    'w-full rounded-[9px] border border-field-line bg-field px-3 py-2.5 text-sm text-ink outline-none transition ' +
    'placeholder:text-field-ph focus:border-gold focus:ring-4 focus:ring-gold/15';

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await adminApi.post('/admin/2fa/challenge', { challengeToken: challenge, code });
      adminToken.set(data.data.accessToken, data.data.refreshToken);
      router.replace('/admin');
    } catch {
      setError('That code is not correct');
    } finally { setBusy(false); }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-canvas px-6">
      {/* the switch is reachable before sign-in too — the preference is the
          browser's, not the account's */}
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <form onSubmit={challenge ? verify : submit}
            className="w-full max-w-sm space-y-4 rounded-[14px] border border-line bg-card p-6 shadow-raise">
        <div className="flex flex-col items-center gap-2 pb-1 text-center">
          {/* the mark keeps its navy plate in both themes — brand, not surface */}
          <span className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-navy">
            <Image src="/brand/FX.png" alt="" aria-hidden fill sizes="48px"
                   className="scale-[1.55] object-cover mix-blend-screen" />
          </span>
          <p className="text-xl font-bold tracking-[-0.02em] text-ink">FortuneX</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-gold">Admin console</p>
        </div>

        {challenge ? (
          <>
            <p className="text-center text-[12.5px] leading-relaxed text-ink-2">
              Enter the 6-digit code from your authenticator app.
            </p>
            <label className="block">
              <span className="sr-only">Authentication code</span>
              <input inputMode="numeric" maxLength={6} required autoFocus autoComplete="one-time-code"
                     value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                     placeholder="000000"
                     className={`${field} text-center font-mono text-base tracking-[0.35em]`} />
            </label>
          </>
        ) : (
          <>
            <label className="block">
              <span className="sr-only">Email</span>
              <input type="email" required autoComplete="username" value={email}
                     onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={field} />
            </label>
            <label className="block">
              <span className="sr-only">Password</span>
              <input type="password" required autoComplete="current-password" value={password}
                     onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={field} />
            </label>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-xs font-medium text-bad-on">{error}</p>
        )}

        <Button type="submit" loading={busy} className="w-full"
                disabled={challenge ? code.length !== 6 : false}>
          {challenge ? 'Verify' : 'Sign in'}
        </Button>

        {challenge && (
          <button type="button" onClick={() => { setChallenge(null); setCode(''); setError(''); }}
                  className="w-full text-center text-[12px] text-ink-3 transition hover:text-ink">
            Back
          </button>
        )}
      </form>
    </main>
  );
}
