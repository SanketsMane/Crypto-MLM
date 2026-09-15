'use client';

import { usdWhole, num, pct } from '@/lib/format';
import { Label } from './panel';

/**
 * Four figures, compact.
 *
 * The old versions of these were 110px-tall cards, each with a pastel icon
 * chip above a label above a value. The chips carried no information — a box
 * icon does not tell anyone what "Total Invested" means — and they cost the
 * vertical space that pushed the chart below the fold.
 *
 * Here each tile is the value, its label, and one line of context that the old
 * card did not have room for: what the number means relative to something.
 * Ratios, not decoration.
 */

export interface KpiProps {
  invested?: string;
  earned?: string;
  teamBusiness?: string;
  activePackages?: number;
  packageCount?: number;
  teamSize?: number;
  directCount?: number;
  activeDirectCount?: number;
  powerLeg?: string;
  otherLegs?: string;
  loading?: boolean;
}

function Tile({ label, value, context, accent }: {
  label: string; value: string; context?: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[5px] border border-line bg-card px-3 py-2.5">
      <Label>{label}</Label>
      <p className={`mt-1.5 truncate tabular-nums text-[19px] font-semibold leading-none tracking-[-0.02em] ${accent ? 'text-good' : 'text-ink'}`}>
        {value}
      </p>
      {context && <p className="mt-1.5 truncate text-[10.5px] text-ink-3">{context}</p>}
    </div>
  );
}

export function KpiRail(p: KpiProps) {
  const invested = Number(p.invested ?? 0);
  const earned = Number(p.earned ?? 0);
  const power = Number(p.powerLeg ?? 0);
  const other = Number(p.otherLegs ?? 0);
  const legTotal = power + other;

  return (
    <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
      <Tile
        label="Capital deployed"
        value={p.loading ? '—' : usdWhole(invested)}
        context={`${num(p.packageCount ?? 0)} package${(p.packageCount ?? 0) === 1 ? '' : 's'} · ${num(p.activePackages ?? 0)} active`}
      />
      <Tile
        label="Total earned"
        value={p.loading ? '—' : usdWhole(earned)}
        accent={earned > 0}
        /* Return against capital is the number a member actually compares —
           and it is the same ratio the ceiling is measured in. */
        context={invested > 0 ? `${pct((earned / invested) * 100)} of capital` : 'no capital deployed yet'}
      />
      <Tile
        label="Team business"
        value={p.loading ? '—' : usdWhole(p.teamBusiness)}
        context={`${num(p.teamSize ?? 0)} members · ${num(p.activeDirectCount ?? 0)}/${num(p.directCount ?? 0)} directs active`}
      />
      <Tile
        label="Power leg / other"
        value={p.loading || legTotal === 0 ? '—' : `${Math.round((power / legTotal) * 100)}/${Math.round((other / legTotal) * 100)}`}
        /* The 50:50 rule decides rank promotion, so the balance matters more
           than either volume on its own. */
        context={legTotal === 0 ? 'no team volume yet' : 'ranks need the weaker legs at 50%'}
      />
    </div>
  );
}
