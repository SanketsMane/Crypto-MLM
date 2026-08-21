'use client';

import { usePathname } from 'next/navigation';
import { QueryProvider } from '@/providers/query-provider';
import { AdminLayout } from '@/components/layout/admin-layout';

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin/login') return <QueryProvider>{children}</QueryProvider>;
  return (
    <QueryProvider>
      <AdminLayout>{children}</AdminLayout>
    </QueryProvider>
  );
}
