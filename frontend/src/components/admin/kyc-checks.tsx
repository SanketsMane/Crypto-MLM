import { clsx } from 'clsx';
import { AlertTriangle, Check, X } from 'lucide-react';

export type CheckLevel = 'PASS' | 'WARN' | 'FAIL';
export interface ReviewCheck {
  key: string;
  label: string;
  level: CheckLevel;
  detail: string;
}

const STYLE: Record<CheckLevel, { icon: typeof Check; chip: string; text: string }> = {
  PASS: { icon: Check,          chip: 'bg-good-soft text-good-on', text: 'text-ink-2' },
  WARN: { icon: AlertTriangle,  chip: 'bg-warn-soft text-warn-on', text: 'text-warn-on' },
  FAIL: { icon: X,              chip: 'bg-bad-soft text-bad-on',   text: 'text-bad' },
};

/**
 * What the reviewer must look at before deciding.
 *
 * Deliberately a list rather than a single verdict: an operator approving
 * identity documents should see each thing that was checked and what it said,
 * not a green tick that hides an under-age applicant behind an average.
 */
export function KycChecks({ checks }: { checks: ReviewCheck[] }) {
  if (!checks.length) return null;
  const failed = checks.filter((c) => c.level === 'FAIL');
  const warned = checks.filter((c) => c.level === 'WARN');

  return (
    <section className="border-b border-line px-5 py-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-2">Verification checks</p>
        {failed.length > 0 && (
          <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[10.5px] font-semibold text-bad-on">
            {failed.length} blocking
          </span>
        )}
        {warned.length > 0 && (
          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10.5px] font-semibold text-warn-on">
            {warned.length} to confirm
          </span>
        )}
      </div>

      <ul className="space-y-1.5">
        {checks.map((c) => {
          const s = STYLE[c.level];
          return (
            <li key={c.key} className="flex items-start gap-2.5">
              <span className={clsx('mt-px grid size-[18px] shrink-0 place-items-center rounded-full', s.chip)}>
                <s.icon size={11} strokeWidth={2.6} />
              </span>
              <p className="min-w-0 text-[12.5px] leading-snug">
                <span className="font-medium text-ink">{c.label}</span>
                <span className={clsx('ml-1.5', s.text)}>— {c.detail}</span>
              </p>
            </li>
          );
        })}
      </ul>

      {failed.length > 0 && (
        <p className="mt-3 rounded-[8px] border border-bad/25 bg-bad-soft px-3 py-2 text-[12px] leading-relaxed text-bad-on">
          Approval is blocked while a check is failing. Resolve it with the member, or reject the submission
          with a reason.
        </p>
      )}
    </section>
  );
}
