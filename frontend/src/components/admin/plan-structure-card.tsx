'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, Check, Info, Lock } from 'lucide-react';
import { Card, CardHead, Badge, Button } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { UnilevelDiagram, BinaryDiagram } from './plan-diagrams';

export interface PlanStructureInfo {
  code: 'UNILEVEL' | 'BINARY';
  label: string;
  summary: string;
  detail: string;
  effects: string[];
  implemented: boolean;
}

export interface PlanLock {
  locked: boolean;
  reason: string | null;
  sponsoredMembers: number;
  lockedAt: string | null;
}

const DIAGRAM = {
  UNILEVEL: UnilevelDiagram,
  BINARY: BinaryDiagram,
} as const;

/**
 * The one setting the platform cannot take back.
 *
 * It is given its own panel rather than a row in the settings list because it
 * is not a value to tune — it is a decision made once, before the first
 * downline forms. The console reflects the lock, but the server is what
 * enforces it (see `settings.service.set`).
 */
export function PlanStructureCard({
  structures, current, lock, onChoose, saving,
}: {
  structures: PlanStructureInfo[];
  current: string;
  lock: PlanLock | undefined;
  onChoose: (code: string) => void;
  saving: boolean;
}) {
  const [pending, setPending] = useState<PlanStructureInfo | null>(null);
  const [typed, setTyped] = useState('');

  const locked = lock?.locked ?? false;
  const confirmed = typed.trim().toUpperCase() === pending?.label.toUpperCase();

  const open = (s: PlanStructureInfo) => { setPending(s); setTyped(''); };
  const close = () => { setPending(null); setTyped(''); };

  return (
    <Card>
      <CardHead
        title="Compensation plan structure"
        subtitle="The genealogy every commission is calculated on. Chosen once, before the first member joins under a sponsor."
        action={
          locked
            ? <Badge tone="neutral"><Lock size={11} className="mr-1 inline" />locked</Badge>
            : <Badge tone="good">open</Badge>
        }
      />

      <div className="px-5 pb-5">
        {locked ? (
          <p className="mb-4 flex items-start gap-2.5 rounded-[5px] border border-line bg-canvas px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2">
            <Lock size={14} className="mt-px shrink-0 text-ink-3" />
            <span>
              {lock?.reason}
              {lock?.lockedAt && (
                <> Locked on {new Date(lock.lockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.</>
              )}
            </span>
          </p>
        ) : (
          <p className="mb-4 flex items-start gap-2.5 rounded-[5px] border border-gold-line/30 bg-gold/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2">
            <AlertTriangle size={14} className="mt-px shrink-0 text-[var(--color-gold-on-soft)]" />
            <span>
              This can still be changed because no member has joined under a sponsor yet.
              It locks permanently the moment the first one does.
            </span>
          </p>
        )}

        <div className="grid gap-3.5 lg:grid-cols-2">
          {structures.map((s) => {
            const active = s.code === current;
            const choosable = !locked && s.implemented && !active;
            const Diagram = DIAGRAM[s.code];

            return (
              <div
                key={s.code}
                className={clsx(
                  'relative flex flex-col rounded-[5px] border p-4 transition-all duration-200',
                  active
                    ? 'border-gold bg-gold/[0.05] shadow-card'
                    : 'border-line bg-card',
                  choosable && 'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raise',
                  !s.implemented && 'opacity-70',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                      {s.label}
                      {active && <Check size={14} className="text-[var(--color-gold-on-soft)]" />}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-2">{s.summary}</p>
                  </div>
                  {active
                    ? <Badge tone="gold">in force</Badge>
                    : !s.implemented
                      ? <Badge tone="neutral">not available yet</Badge>
                      : null}
                </div>

                {/* frozen unless it is a live option the operator could pick */}
                <div className="my-3 rounded-[5px] border border-line-soft bg-canvas py-1">
                  <Diagram still={locked || !s.implemented} />
                </div>

                <p className="text-[12px] leading-relaxed text-ink-2">{s.detail}</p>

                <ul className="mt-3 space-y-1.5">
                  {s.effects.map((e) => (
                    <li key={e} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-3">
                      <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-ink-4" />
                      {e}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 pt-1">
                  {active ? (
                    <p className="text-[11.5px] font-medium text-ink-3">Currently in force</p>
                  ) : !s.implemented ? (
                    <p className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                      <Info size={12} /> The payout engine does not implement this yet.
                    </p>
                  ) : (
                    <Button size="sm" variant="outline" disabled={!choosable} onClick={() => open(s)}>
                      Use {s.label}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Typing the name is the point: this is a one-way door, so it should
          not be reachable by a stray click. */}
      <Modal
        open={!!pending}
        onClose={close}
        title={`Switch to ${pending?.label ?? ''}?`}
        description="This decision is permanent once the first member joins under a sponsor. It cannot be undone from the console."
        icon={<AlertTriangle size={18} className="text-[var(--color-gold-on-soft)]" />}
        footer={
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button
              disabled={!confirmed}
              loading={saving}
              onClick={() => { if (pending) { onChoose(pending.code); close(); } }}
            >
              Switch to {pending?.label}
            </Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-3">
            <ul className="space-y-1.5 rounded-[5px] border border-line bg-canvas px-3.5 py-3">
              {pending.effects.map((e) => (
                <li key={e} className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-2">
                  <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-ink-4" />
                  {e}
                </li>
              ))}
            </ul>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink">
                Type <code className="font-mono text-ink-2">{pending.label}</code> to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                aria-label={`Type ${pending.label} to confirm`}
                className="h-10 w-full rounded-[4px] border border-field-line bg-field px-3 text-[13px] text-ink outline-none transition placeholder:text-field-ph focus:border-gold focus:ring-4 focus:ring-gold/15"
              />
            </label>
          </div>
        )}
      </Modal>
    </Card>
  );
}
