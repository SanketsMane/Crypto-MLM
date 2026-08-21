'use client';

import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle } from 'lucide-react';
import { Button } from './primitives';
import { Modal } from './modal';

export interface DialogField {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  help?: string;
  /** Rendered as a textarea when true — for reasons an operator should think about. */
  multiline?: boolean;
}

/**
 * Confirmation dialog for actions that move money or cannot be undone.
 *
 * It exists because the console used to approve a payout on a single click and
 * send a hardcoded `"Rejected by operator"` as the audit reason. Anything
 * irreversible now costs a deliberate second action, and any reason recorded in
 * the audit log is one a human actually typed.
 */
export function ActionDialog({
  open, onClose, onConfirm, title, body, confirmLabel, tone = 'primary', fields = [], pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (values: Record<string, string>) => void;
  title: string;
  body?: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  fields?: DialogField[];
  pending?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  /* reset between openings so a previous reason never leaks into a new action */
  useEffect(() => {
    if (open) { setValues({}); setTouched(false); }
  }, [open]);

  const missing = fields.filter((f) => {
    const v = (values[f.name] ?? '').trim();
    if (f.required && !v) return true;
    if (f.minLength && v.length < f.minLength) return true;
    return false;
  });

  const submit = () => {
    setTouched(true);
    if (missing.length) { firstFieldRef.current?.focus(); return; }
    onConfirm(values);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={body}
      icon={
        <span className={clsx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full',
          tone === 'danger' ? 'bg-bad-soft text-bad-on' : 'bg-gold-soft text-gold-on-soft')}>
          <AlertTriangle size={16} strokeWidth={2.2} />
        </span>
      }
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant={tone === 'danger' ? 'danger' : 'primary'} loading={pending} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {fields.length > 0 && (
        <div className="space-y-3">
          {fields.map((f, i) => {
            const v = values[f.name] ?? '';
            const bad = touched && missing.includes(f);
            const cls = clsx(
              'w-full rounded-[9px] border bg-field px-3 py-2 text-[13px] text-ink outline-none transition',
              'placeholder:text-field-ph focus:ring-4',
              bad ? 'border-bad focus:border-bad focus:ring-bad/15' : 'border-field-line focus:border-gold focus:ring-gold/15',
            );
            return (
              <label key={f.name} className="block">
                <span className="mb-1 block text-[12px] font-medium text-ink-2">
                  {f.label}{f.required && <span className="text-bad"> *</span>}
                </span>
                {f.multiline ? (
                  <textarea
                    ref={i === 0 ? (firstFieldRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                    rows={3} value={v} placeholder={f.placeholder} className={clsx(cls, 'resize-none')}
                    onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
                  />
                ) : (
                  <input
                    ref={i === 0 ? (firstFieldRef as React.RefObject<HTMLInputElement>) : undefined}
                    value={v} placeholder={f.placeholder} className={cls}
                    onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                  />
                )}
                {bad ? (
                  <span className="mt-1 block text-[11.5px] text-bad">
                    {f.minLength ? `At least ${f.minLength} characters.` : 'This is required.'}
                  </span>
                ) : f.help ? (
                  <span className="mt-1 block text-[11.5px] text-ink-3">{f.help}</span>
                ) : null}
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
