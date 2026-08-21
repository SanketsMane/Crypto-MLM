'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { adminPost, adminError } from '@/lib/admin-api';
import { Button } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';

/**
 * Register a member on their behalf.
 *
 * Support needs this for someone who cannot complete sign-up themselves. It
 * goes through the same server path as public registration, so the account
 * lands complete — wallets, team-volume row and sponsor counters all created —
 * rather than as a partial user that breaks the commission walk later.
 */
export function NewMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const empty = { email: '', firstName: '', lastName: '', phone: '', password: '', sponsorCode: '' };
  const [form, setForm] = useState(empty);

  useEffect(() => { if (open) setForm(empty); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const create = useMutation({
    mutationFn: () => adminPost<{ userCode: string }>('/admin/users', {
      email: form.email.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim() || undefined,
      phone: form.phone.trim() || undefined,
      password: form.password,
      sponsorCode: form.sponsorCode.trim() || undefined,
    }),
    onSuccess: (r) => {
      toast.success(`Member ${r.userCode} created`);
      onClose();
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => toastError(e),
  });

  const set = (k: keyof typeof empty, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const valid = form.email.includes('@') && form.firstName.trim().length >= 2 && form.password.length >= 8;

  const field =
    'w-full rounded-[9px] border border-field-line bg-field px-3 py-2 text-[13px] text-ink outline-none ' +
    'transition placeholder:text-field-ph focus:border-gold focus:ring-4 focus:ring-gold/15';

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="New member"
      description="Creates an active account immediately. The member can sign in with the password you set here — send it to them over a channel you trust, and ask them to change it."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>
            Create member
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['firstName', 'First name *', 'text', 'Priya'],
          ['lastName', 'Last name', 'text', 'Sharma'],
          ['email', 'Email *', 'email', 'member@example.com'],
          ['phone', 'Phone', 'tel', '+91…'],
          ['password', 'Temporary password *', 'password', 'at least 8 characters'],
          ['sponsorCode', 'Sponsor code', 'text', 'FX100001 — optional'],
        ] as const).map(([key, label, type, placeholder]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-2">{label}</span>
            <input
              type={type} value={form[key]} placeholder={placeholder} className={field}
              autoComplete={type === 'password' ? 'new-password' : 'off'}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-ink-3">
        Leaving the sponsor blank places the member at the root of the network, outside anyone&apos;s downline.
      </p>
    </Modal>
  );
}
