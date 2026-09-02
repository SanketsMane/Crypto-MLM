'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { isAuthFailure } from '@/lib/errors';
import { ErrorState } from '@/components/ui/error-state';
import { MemberSidebar } from '@/components/member/sidebar';
import { MemberHeader } from '@/components/member/top-header';
import { MEMBER_PAGE } from '@/components/member/nav-config';
import { PageHeader } from '@/components/ui/primitives';
import { get } from '@/lib/api';
import { useMe } from '@/features/auth/use-auth';
import { SessionLoading } from '@/components/ui/session-loading';
import { AnnouncementBanners } from '@/features/announcements/banner';
import { SupportViewBar } from '@/features/support-view/support-view';

interface Head { profile: { name: string; userCode: string; referralLink: string; rank: { name: string } | null } }

/** pages that draw their own page-level heading */
const SELF_HEADED = new Set(['/dashboard', '/flyers-club', '/wallet']);

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isError, isLoading, error, refetch } = useMe();
  // Only a refused credential ends the session. A network failure means we do
  // not know, and the honest response is to say so rather than to sign them out.
  const signedOut = isError && isAuthFailure(error);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['member', 'dashboard'],
    queryFn: () => get<Head>('/customer/dashboard'),
    enabled: !signedOut,
  });

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => { if (signedOut) router.replace('/login'); }, [signedOut, router]);

  if (isLoading) return <SessionLoading label="Loading your account" />;
  if (signedOut) return null;

  /**
   * Reachable, but not loadable.
   *
   * The member stays where they are, with a way to retry — losing a session to
   * a five-second outage is a far worse outcome than a screen that says it
   * could not load.
   */
  if (isError) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="w-full max-w-lg">
          <ErrorState error={error} retry={() => void refetch()} title="Could not load your account" full />
        </div>
      </div>
    );
  }

  const page = MEMBER_PAGE[pathname];

  return (
    <div className="flex min-h-screen bg-canvas">
      <MemberSidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Above the chrome, so an operator can never mistake whose account
            they are looking at. */}
        <SupportViewBar />
        <MemberHeader member={data?.profile} onToggleSidebar={() => setCollapsed((c) => !c)} onOpenMobile={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-[1520px]">
            {/* some pages render their own header: the dashboard hosts the date
                control in it, Flyers Club replaces it with brand artwork */}
            {page && !SELF_HEADED.has(pathname) && <PageHeader title={page.title} subtitle={page.subtitle} />}
            <AnnouncementBanners />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
