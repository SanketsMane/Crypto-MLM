'use client';
import { PageHeader } from '@/components/ui/primitives';
import { NotBuiltYet } from '@/components/ui/not-built';

export default function Page() {
  return (
    <>
      <PageHeader title="Trading desk" subtitle="Not available yet." />
      <NotBuiltYet
        title="Trading desk is not built yet"
        what="A live trading module — order flow, open positions and market data — is not part of the platform today."
        why="FortuneX currently pays a fixed daily return on investment packages rather than executing trades, so there is no order book to display. This screen is reserved for when a broker or exchange integration is added."
      />
    </>
  );
}
