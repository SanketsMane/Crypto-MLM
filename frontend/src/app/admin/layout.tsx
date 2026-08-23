'use client';

import { usePathname } from 'next/navigation';
import { QueryProvider } from '@/providers/query-provider';
import { AdminLayout } from '@/components/layout/admin-layout';
import { ConfirmProvider } from '@/components/ui/confirm';

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin/login') return <QueryProvider>{children}</QueryProvider>;
  return (
    <QueryProvider>
      {/* One confirmation gate for every destructive action in the console. */}
      <ConfirmProvider>
        <AdminLayout>{children}</AdminLayout>
      </ConfirmProvider>
    </QueryProvider>
  );
}
