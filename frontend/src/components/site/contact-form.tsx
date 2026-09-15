'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, Send } from 'lucide-react';
import { apiBase } from '@/lib/api-base';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const SUBJECTS = [
  'General enquiry',
  'Account or verification',
  'Deposits and withdrawals',
  'The compensation plan',
  'Partnership or media',
];

export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', phone: '', subject: SUBJECTS[0], message: '', website: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const valid =
    form.name.trim().length >= 2 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) &&
    form.message.trim().length >= 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || status === 'sending') return;
    setStatus('sending'); setError('');
    try {
      const res = await fetch(`${apiBase()}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'We could not send that just now.');
      }
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'We could not send that just now.');
    }
  };

  // the trailing two variables keep an autofilled field navy instead of letting
  // the browser repaint it pale — see the `:-webkit-autofill` block in globals.css
  const field =
    'w-full rounded-[10px] border border-white/12 bg-navy-deep/60 px-3.5 py-3 text-[14px] text-white outline-none ' +
    'transition placeholder:text-white/28 focus:border-brand-gold/60 focus:ring-4 focus:ring-brand-gold/12 ' +
    '[--fx-autofill-bg:var(--color-navy-deep)] [--fx-autofill-fg:#FFFFFF]';

  if (status === 'sent') {
    return (
      <div className="rounded-2xl border border-brand-gold/25 bg-brand-gold/[0.06] p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-brand-gold/30 bg-brand-gold/10 text-brand-gold">
          <CheckCircle2 size={22} />
        </span>
        <h3 className="mt-4 text-[18px] font-semibold text-white">Message received</h3>
        <p className="mx-auto mt-2 max-w-[42ch] text-[13.5px] leading-relaxed text-white/60">
          Thank you — we have your enquiry and will reply to{' '}
          <span className="text-white">{form.email}</span>. Most messages are answered within one
          business day.
        </p>
        <button
          onClick={() => { setForm({ name: '', email: '', phone: '', subject: SUBJECTS[0], message: '', website: '' }); setStatus('idle'); }}
          className="mt-5 text-[13.5px] font-medium text-brand-gold transition hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-white/[0.07] bg-navy-card/60 p-6 sm:p-8">
      {/* honeypot — off-screen rather than display:none, which some bots skip */}
      <div aria-hidden className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Do not fill this in
          <input tabIndex={-1} autoComplete="off" value={form.website}
                 onChange={(e) => set('website', e.target.value)} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-white/70">Your name <span className="text-brand-gold">*</span></span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)}
                 placeholder="Priya Sharma" className={field} autoComplete="name" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-white/70">Email <span className="text-brand-gold">*</span></span>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                 placeholder="you@example.com" className={field} autoComplete="email" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-white/70">Phone <span className="text-white/55">(optional)</span></span>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                 placeholder="+971 …" className={field} autoComplete="tel" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-white/70">Subject</span>
          <select value={form.subject} onChange={(e) => set('subject', e.target.value)}
                  className={clsx(field, 'appearance-none bg-[length:0] pr-9')}>
            {SUBJECTS.map((s) => <option key={s} value={s} className="bg-navy-deep">{s}</option>)}
          </select>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[12.5px] font-medium text-white/70">Message <span className="text-brand-gold">*</span></span>
        <textarea rows={5} value={form.message} onChange={(e) => set('message', e.target.value)}
                  placeholder="Tell us what you need. If it concerns an existing account, include your member ID."
                  className={clsx(field, 'resize-none')} />
        <span className="mt-1.5 block text-[11.5px] text-white/55">
          Never send passwords, recovery phrases or private keys — we will never ask for them.
        </span>
      </label>

      {status === 'error' && (
        <p role="alert" className="mt-4 rounded-[10px] border border-bad/30 bg-bad/10 px-4 py-3 text-[13px] text-white">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!valid || status === 'sending'}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[11px] bg-gold px-6 py-3.5 text-[14px] font-semibold text-gold-on transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
      >
        {status === 'sending' ? (
          <><span className="h-4 w-4 animate-spin rounded-full border-2 border-navy/40 border-t-navy" /> Sending…</>
        ) : (
          <><Send size={15} strokeWidth={2.3} /> Send message</>
        )}
      </button>
    </form>
  );
}
