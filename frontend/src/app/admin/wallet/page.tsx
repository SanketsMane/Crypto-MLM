'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Percent, Wallet } from 'lucide-react';
import { adminGet } from '@/lib/admin-api';
import { Card, CardHead, PageHeader, Table } from '@/components/ui/primitives';
import { StatCard } from '@/components/dashboard/stat-card';
import { usd, num, titleCase } from '@/lib/format';

interface Res {
  heldTotal: string;
  byWallet: { type: string; balance: string; accounts: number }[];
  depositsIn: string; depositCount: number;
  withdrawalsOut: string; withdrawalCount: number; feesCollected: string;
}
const ROLE: Record<string, string> = { MAIN: 'Income and withdrawals', FUND: 'Deposits and purchases', DIGITAL: 'Digital assets' };

export default function WalletPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'wallet-summary'], queryFn: () => adminGet<Res>('/admin/wallet-summary') });
  const net = Number(data?.depositsIn ?? 0) - Number(data?.withdrawalsOut ?? 0);

  return (
    <>
      <PageHeader title="Wallet" subtitle="Customer balances held, money in, money out and fees collected." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Balances Held" value={usd(data?.heldTotal)} change={null} icon={Wallet} chip="bg-violet-soft text-violet" loading={isLoading} />
        <StatCard label="Deposits In" value={usd(data?.depositsIn)} change={null} icon={ArrowDownToLine} chip="bg-good-soft text-good" loading={isLoading} />
        <StatCard label="Withdrawals Out" value={usd(data?.withdrawalsOut)} change={null} icon={ArrowUpFromLine} chip="bg-bad-soft text-bad" loading={isLoading} />
        <StatCard label="Fees Collected" value={usd(data?.feesCollected)} change={null} icon={Percent} chip="bg-warn-soft text-warn" loading={isLoading} />
      </div>

      <Card className="mt-3.5">
        <CardHead title="Balances by wallet type" />
        <Table
          head={['Wallet', 'Role', 'Accounts', 'Total balance']}
          empty="No wallets yet."
          rows={(data?.byWallet ?? []).map((w) => [
            <span key="a" className="font-medium">{titleCase(w.type)}</span>,
            <span key="b" className="text-ink-2">{ROLE[w.type] ?? '—'}</span>,
            <span key="c" className="tabular-nums">{num(w.accounts)}</span>,
            <span key="d" className="font-medium tabular-nums">{usd(w.balance)}</span>,
          ])}
        />
        <p className="border-t border-line px-4 py-3 text-[12.5px] text-ink-2">
          Net platform position: <span className={`font-semibold tabular-nums ${net >= 0 ? 'text-good' : 'text-bad'}`}>{usd(net)}</span>
          {' '}— deposits received less withdrawals paid.
        </p>
      </Card>
    </>
  );
}
