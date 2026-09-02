'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { TopHeader } from './top-header';
import { useAdmin } from '@/features/admin/use-admin';
import { SessionLoading } from '@/components/ui/session-loading';
import { isAuthFailure } from '@/lib/errors';
import { ErrorState } from '@/components/ui/error-state';

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isError, isLoading, error, refetch } = useAdmin();
  // Same rule as the member area: only a refused credential ends the session.
  // An operator working a payout queue must not be thrown out by a blip.
  const signedOut = isError && isAuthFailure(error);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => { if (signedOut) router.replace('/admin/login'); }, [signedOut, router]);

  if (isLoading) return <SessionLoading label="Loading the console" />;
  if (signedOut) return null;

  if (isError) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="w-full max-w-lg">
          <ErrorState error={error} retry={() => void refetch()} title="Could not load the console" full />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader onToggleSidebar={() => setCollapsed((c) => !c)} onOpenMobile={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-[1520px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
