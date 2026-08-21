'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MemberSidebar } from '@/components/member/sidebar';
import { MemberHeader } from '@/components/member/top-header';
import { MEMBER_PAGE } from '@/components/member/nav-config';
import { PageHeader } from '@/components/ui/primitives';
import { get } from '@/lib/api';
import { useMe } from '@/features/auth/use-auth';
import { AnnouncementBanners } from '@/features/announcements/banner';
import { SupportViewBar } from '@/features/support-view/support-view';

interface Head { profile: { name: string; userCode: string; referralLink: string; rank: { name: string } | null } }

/** pages that draw their own page-level heading */
const SELF_HEADED = new Set(['/dashboard', '/roaming-club', '/wallet']);

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isError, isLoading } = useMe();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['member', 'dashboard'],
    queryFn: () => get<Head>('/customer/dashboard'),
    enabled: !isError,
  });

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => { if (isError) router.replace('/login'); }, [isError, router]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-violet" />
      </div>
    );
  }
  if (isError) return null;

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
                control in it, Roaming Club replaces it with brand artwork */}
            {page && !SELF_HEADED.has(pathname) && <PageHeader title={page.title} subtitle={page.subtitle} />}
            <AnnouncementBanners />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
