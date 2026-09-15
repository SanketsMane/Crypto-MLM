'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, FileText } from 'lucide-react';
import { get } from '@/lib/api';
import { Card, CardHead, Button, Skeleton, controlCls } from '@/components/ui/primitives';
import { usd } from '@/lib/format';
import { useBrandName } from '@/providers/brand-provider';

interface Entry {
  date: string; reference: string; description: string; category: string;
  wallet: string; direction: 'CREDIT' | 'DEBIT'; amount: string; balanceAfter: string;
}

interface Statement {
  member: { userCode: string; name: string; email: string; memberSince: string };
  period: { from: string; to: string };
  opening: string;
  closing: string;
  totals: { credits: string; debits: string; net: string; entries: number };
  byCategory: { category: string; credits: string; debits: string; count: number }[];
  entries: Entry[];
  generatedAt: string;
}

const monthValue = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

const shortDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });

const title = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/**
 * A statement, not a transaction list.
 *
 * The difference is reconciliation: an opening balance, a closing balance, and
 * totals that account for the gap between them. That is what makes it something
 * a member can file or hand to an accountant.
 *
 * Printed through the browser rather than rendered server-side to PDF. It keeps
 * a PDF toolchain out of the API for a document nobody generates in bulk, and
 * the browser's own "save as PDF" produces a better file than most libraries.
 */
export default function StatementPage() {
  const brand = useBrandName();
  const now = new Date();
  const [month, setMonth] = useState(monthValue(now));

  const [year, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(year!, m! - 1, 1));
  const to = new Date(Date.UTC(year!, m!, 0, 23, 59, 59));

  const data = useQuery<Statement>({
    queryKey: ['member', 'statement', month],
    queryFn: () => get('/income/statement/period', {
      from: from.toISOString(),
      to: to.toISOString(),
    }),
  });

  const s = data.data;

  return (
    <div className="space-y-4">
      {/* Controls are screen-only — they have no place on the printed page. */}
      <Card className="print:hidden">
        <CardHead
          title="Account statement"
          subtitle="A reconciled summary for one month, ready to print or save as PDF."
          right={
            <Button onClick={() => window.print()} disabled={!s}>
              <Printer size={14} /> Print or save as PDF
            </Button>
          }
        />
        <div className="px-3.5 pb-3.5">
          <label className="block max-w-[220px]">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Month</span>
            <input
              type="month"
              value={month}
              max={monthValue(now)}
              onChange={(e) => setMonth(e.target.value)}
              className={`${controlCls} h-9 w-full`}
            />
          </label>
        </div>
      </Card>

      {data.isLoading ? (
        <Card><div className="p-3.5"><Skeleton className="h-96" /></div></Card>
      ) : !s ? null : (
        <Card className="print:border-0 print:shadow-none">
          <div className="space-y-6 p-3.5 sm:p-7 print:p-0">

            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-3.5">
              <div>
                {/* A statement is a document someone may file or forward, so
                    this is one of the few places the operator's name genuinely
                    has to appear rather than being removed. */}
                <p className="text-[19px] font-bold tracking-[-0.02em] text-gold">{brand}</p>
                <p className="mt-0.5 text-[12px] text-ink-2">Account statement</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-semibold text-ink">{s.member.name}</p>
                <p className="font-mono text-[11.5px] text-ink-2">{s.member.userCode}</p>
                <p className="text-[11.5px] text-ink-3">{s.member.email}</p>
              </div>
            </header>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[10.5px] uppercase tracking-[0.05em] text-ink-3">Period</p>
                <p className="mt-1 text-[13.5px] text-ink">
                  {longDate(s.period.from)} — {longDate(s.period.to)}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-[10.5px] uppercase tracking-[0.05em] text-ink-3">Issued</p>
                <p className="mt-1 text-[13.5px] text-ink">{longDate(s.generatedAt)}</p>
              </div>
            </div>

            {/* The reconciliation. Opening, movement, closing — in that order,
                because that is the order someone checks it in. */}
            <div className="grid gap-px overflow-hidden rounded-[5px] border border-line bg-line sm:grid-cols-4">
              {[
                { k: 'Opening balance', v: usd(Number(s.opening)) },
                { k: 'Money in', v: `+${usd(Number(s.totals.credits))}`, tone: 'text-good' },
                { k: 'Money out', v: `−${usd(Number(s.totals.debits))}`, tone: 'text-bad' },
                { k: 'Closing balance', v: usd(Number(s.closing)), strong: true },
              ].map((c) => (
                <div key={c.k} className="bg-card px-4 py-3">
                  <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-3">{c.k}</p>
                  <p className={`mt-1 text-[15px] tabular-nums ${c.strong ? 'font-bold text-ink' : `font-semibold ${c.tone ?? 'text-ink'}`}`}>
                    {c.v}
                  </p>
                </div>
              ))}
            </div>

            {s.byCategory.length > 0 && (
              <section>
                <h2 className="mb-2 text-[13px] font-semibold text-ink">Summary by type</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.04em] text-ink-3">
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 text-right font-medium">Entries</th>
                        <th className="pb-2 text-right font-medium">In</th>
                        <th className="pb-2 text-right font-medium">Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.byCategory.map((c) => (
                        <tr key={c.category} className="border-b border-line/60">
                          <td className="py-2 text-ink">{title(c.category)}</td>
                          <td className="py-2 text-right tabular-nums text-ink-2">{c.count}</td>
                          <td className="py-2 text-right tabular-nums text-good">
                            {Number(c.credits) ? usd(Number(c.credits)) : '—'}
                          </td>
                          <td className="py-2 text-right tabular-nums text-bad">
                            {Number(c.debits) ? usd(Number(c.debits)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-2 text-[13px] font-semibold text-ink">
                Transactions — {s.totals.entries}
              </h2>
              {!s.entries.length ? (
                <div className="flex flex-col items-center gap-2 rounded-[5px] border border-dashed border-line py-10 text-center">
                  <FileText size={20} className="text-ink-3" />
                  <p className="text-[13px] text-ink-2">Nothing moved in this period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-[12px]">
                    <thead>
                      <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.04em] text-ink-3">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Description</th>
                        <th className="pb-2 font-medium">Reference</th>
                        <th className="pb-2 text-right font-medium">Amount</th>
                        <th className="pb-2 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.entries.map((e) => (
                        <tr key={e.reference} className="border-b border-line/60 align-top">
                          <td className="py-2 whitespace-nowrap text-ink-2">{shortDateTime(e.date)}</td>
                          <td className="py-2 text-ink">
                            {e.description}
                            <span className="ml-1.5 text-[10.5px] text-ink-3">{e.wallet}</span>
                          </td>
                          <td className="py-2 font-mono text-[10.5px] text-ink-3">{e.reference}</td>
                          <td className={`py-2 text-right tabular-nums font-medium ${
                            e.direction === 'CREDIT' ? 'text-good' : 'text-bad'}`}>
                            {e.direction === 'CREDIT' ? '+' : '−'}{usd(Number(e.amount))}
                          </td>
                          <td className="py-2 text-right tabular-nums text-ink-2">
                            {usd(Number(e.balanceAfter))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <footer className="border-t border-line pt-4 text-[10.5px] leading-relaxed text-ink-3">
              <p>
                This statement covers the main wallet balance for the period shown. Figures are in
                USD and settled in USDT on BEP-20. Member since {longDate(s.member.memberSince)}.
              </p>
              <p className="mt-1">
                Generated from the platform ledger, which is append-only — no entry on this statement
                has been altered after it was written.
              </p>
            </footer>
          </div>
        </Card>
      )}
    </div>
  );
}
