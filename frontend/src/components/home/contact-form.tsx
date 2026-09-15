'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { apiBase } from '@/lib/api-base';
import { Card } from './sections';

const SUBJECTS = [
  'General enquiry',
  'Account or verification',
  'Deposits and withdrawals',
  'Partnership',
];

/**
 * Contact form, styled for this page but posting to the same `/contact`
 * endpoint the rest of the site uses — including the honeypot field, which is
 * what keeps the endpoint from becoming a spam relay. Nothing about the
 * submission contract changed.
 */
export function ContactForm() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', subject: SUBJECTS[0], message: '', website: '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch(`${apiBase()}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Could not send your message. Please try again.');
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const field =
    'w-full rounded-xl border border-[var(--home-line)] bg-[var(--home-raised)] px-4 py-3.5 text-[14px] text-[var(--home-text)] outline-none transition ' +
    'placeholder:text-[var(--home-text-2)] focus:border-[var(--home-gold)] focus:ring-4 focus:ring-[var(--home-gold)]/12 ' +
    '[--fx-autofill-bg:#0B0B12] [--fx-autofill-fg:#FFFFFF]';

  if (status === 'sent') {
    return (
      <Card className="p-10 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--home-gold)]/12 text-[var(--home-gold)] ring-1 ring-[var(--home-gold)]/30">
          <CheckCircle2 size={26} strokeWidth={1.9} aria-hidden />
        </span>
        <h3 className="mt-5 text-[20px] font-bold text-[var(--home-text)]">Message sent</h3>
        <p className="mx-auto mt-2.5 max-w-[42ch] text-[13.5px] leading-[1.75] text-[var(--home-text-2)]">
          Thanks — it reached the support desk. You will get a reply at the address you gave us.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <form onSubmit={submit} noValidate className="space-y-4">
        {/* honeypot — hidden from people, irresistible to bots */}
        <div className="absolute left-[-9999px]" aria-hidden>
          <label>
            Do not fill this in
            <input tabIndex={-1} autoComplete="off" value={form.website}
                   onChange={(e) => set('website', e.target.value)} />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[12.5px] font-medium text-[var(--home-text-2)]">
              Your name <span className="text-[var(--home-gold)]">*</span>
            </span>
            <input required value={form.name} onChange={(e) => set('name', e.target.value)}
                   autoComplete="name" placeholder="Priya Sharma" className={field} />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12.5px] font-medium text-[var(--home-text-2)]">
              Email <span className="text-[var(--home-gold)]">*</span>
            </span>
            <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                   autoComplete="email" placeholder="you@example.com" className={field} />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[12.5px] font-medium text-[var(--home-text-2)]">Phone</span>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                   autoComplete="tel" placeholder="Optional" className={field} />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12.5px] font-medium text-[var(--home-text-2)]">Subject</span>
            <select value={form.subject} onChange={(e) => set('subject', e.target.value)}
                    className={`${field} pr-10`}>
              {SUBJECTS.map((s) => <option key={s} value={s} className="bg-[#0B0B12]">{s}</option>)}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-[12.5px] font-medium text-[var(--home-text-2)]">
            Message <span className="text-[var(--home-gold)]">*</span>
          </span>
          <textarea required rows={6} value={form.message} onChange={(e) => set('message', e.target.value)}
                    placeholder="How can we help?" className={`${field} resize-y`} />
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-[var(--home-text)]">
            {error}
          </p>
        )}

        <button type="submit" disabled={status === 'sending'}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-[var(--home-gold)] px-6 py-4 text-[15px] font-semibold text-[var(--color-gold-on)] transition hover:bg-[var(--home-gold-hi)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
          {status === 'sending'
            ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Sending…</>
            : <>Send message <Send size={15} strokeWidth={2.4} aria-hidden /></>}
        </button>
      </form>
    </Card>
  );
}
