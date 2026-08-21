'use client';

import { Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { Card, CardHead, Skeleton } from '@/components/ui/primitives';
import { useNotificationPreferences, type Category, type Transport } from './use-notifications';

/**
 * What each category actually covers.
 *
 * "Money" tells a member nothing about what they are switching off. Spelling it
 * out is the difference between an informed choice and a member silencing their
 * withdrawal confirmations by accident.
 */
const DESCRIPTIONS: Record<Category, string> = {
  MONEY: 'Deposits credited, withdrawals sent, transfers and balance adjustments.',
  EARNINGS: 'Daily returns, sponsor bonuses, ranks and rewards.',
  NETWORK: 'When someone joins or invests using your referral link.',
  SECURITY: 'Sign-ins from new devices, password changes, two-factor and payout address changes.',
  COMPLIANCE: 'Identity verification decisions.',
  SUPPORT: 'Replies on your support tickets.',
  OPERATIONS: 'Approval queues, SLA breaches and anything waiting on you.',
  SYSTEM: 'Platform health, failed jobs and configuration changes.',
};

/** Members never see operator categories, and vice versa. */
const MEMBER_CATEGORIES: Category[] = ['MONEY', 'EARNINGS', 'NETWORK', 'SECURITY', 'COMPLIANCE', 'SUPPORT'];
const ADMIN_CATEGORIES: Category[] = ['OPERATIONS', 'COMPLIANCE', 'SUPPORT', 'SYSTEM', 'MONEY'];

export function NotificationPreferences({
  transport,
  variant = 'member',
}: {
  transport: Transport;
  variant?: 'member' | 'admin';
}) {
  const { query, update } = useNotificationPreferences(transport);
  const visible = variant === 'admin' ? ADMIN_CATEGORIES : MEMBER_CATEGORIES;

  return (
    <Card id="notifications">
      <CardHead
        title="Notifications"
        subtitle="Choose what you are told about, and how."
      />
      <div className="px-5 pb-5">
        {query.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <div className="mb-2 hidden items-center gap-4 pb-1.5 text-[11px] uppercase tracking-[0.04em] text-ink-3 sm:flex">
              <span className="flex-1">Category</span>
              <span className="w-14 text-center">In app</span>
              <span className="w-14 text-center">Email</span>
            </div>

            <ul className="divide-y divide-line">
              {(query.data ?? [])
                .filter((p) => visible.includes(p.category))
                .map((p) => (
                  <li key={p.category} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                        {p.label}
                        {p.locked && (
                          <span title="Security notifications cannot be turned off">
                            <Lock size={11} className="text-ink-3" />
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
                        {DESCRIPTIONS[p.category]}
                      </p>
                      {p.locked && (
                        <p className="mt-1 text-[11.5px] text-ink-3">
                          Being told your password or payout address changed is not optional.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4 sm:gap-0">
                      <Toggle
                        label="In app"
                        checked={p.inApp}
                        disabled={p.locked || update.isPending}
                        onChange={(inApp) => update.mutate({ category: p.category, inApp })}
                      />
                      <Toggle
                        label="Email"
                        checked={p.email}
                        disabled={p.locked || update.isPending}
                        onChange={(email) => update.mutate({ category: p.category, email })}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function Toggle({
  label, checked, disabled, onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={clsx('flex w-14 flex-col items-center gap-1', disabled && 'opacity-50')}>
      <span className="text-[10.5px] text-ink-3 sm:hidden">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative h-[22px] w-[38px] rounded-full transition',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25',
          checked ? 'bg-gold' : 'bg-line-strong',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <span
          className={clsx(
            'absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-all',
            checked ? 'left-[19px]' : 'left-[3px]',
          )}
        />
      </button>
    </label>
  );
}
