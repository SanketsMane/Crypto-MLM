'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast';
import { Download } from 'lucide-react';
import { adminApi, adminError } from '@/lib/admin-api';
import { Button } from '@/components/ui/primitives';

/**
 * Downloads the current view as CSV.
 *
 * The endpoint is permission-gated, so the file cannot be fetched by pointing
 * the browser at a URL — it comes back through the authenticated client as a
 * blob and is handed to the browser from an object URL, which is revoked as
 * soon as the download has been kicked off.
 *
 * `filters` mirrors whatever the screen is showing, so an export is of what the
 * operator is actually looking at, not of everything.
 */
export function ExportButton({ resource, filters, label = 'Export CSV' }: {
  resource: string;
  filters?: Record<string, string | number | undefined>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await adminApi.get(`/admin/export/${resource}`, {
        params: filters, responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        (res.headers['content-disposition'] as string | undefined)?.match(/filename="(.+?)"/)?.[1]
        ?? `fortunex-${resource}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" loading={busy} onClick={run}>
      <Download size={13} /> {label}
    </Button>
  );
}
