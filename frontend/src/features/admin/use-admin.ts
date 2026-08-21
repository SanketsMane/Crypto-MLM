'use client';

import { useQuery } from '@tanstack/react-query';
import { adminGet } from '@/lib/admin-api';

export interface AdminMe {
  id: string; email: string; name: string;
  role: { id: string; name: string; slug: string; level: number };
  permissions: string[];
}

export function useAdmin() {
  const q = useQuery({ queryKey: ['admin', 'me'], queryFn: () => adminGet<AdminMe>('/admin/me'), retry: false });
  const set = new Set(q.data?.permissions ?? []);
  return {
    ...q,
    admin: q.data,
    /** Gate UI on the same keys the API gates on — one source of truth. */
    can: (...keys: string[]) => keys.every((k) => set.has(k)),
    canAny: (...keys: string[]) => keys.some((k) => set.has(k)),
  };
}
