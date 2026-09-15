'use client';

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { AlertCircle, Expand, FileText } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { Skeleton } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';

/**
 * Renders one identity document.
 *
 * The file sits behind a permission-gated endpoint, so it cannot be dropped
 * into an `<img src>` — the browser would send no Authorization header. It is
 * fetched as a blob through the authenticated client and shown from an object
 * URL, which is revoked when the component goes away so the bytes do not linger
 * in memory after the reviewer moves on.
 */
export function DocumentViewer({ id, label, mimeType, sizeBytes }: {
  id: string; label: string; mimeType: string; sizeBytes: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const isPdf = mimeType === 'application/pdf';

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    adminApi
      .get(`/admin/kyc/documents/${id}`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setError('Could not load this document'));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  const kb = sizeBytes >= 1024 * 1024
    ? `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;

  return (
    <>
      <figure className="overflow-hidden rounded-[5px] border border-line bg-canvas">
        <figcaption className="flex items-center gap-2 border-b border-line bg-card px-3 py-2">
          <FileText size={13} className="shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{label}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-ink-3">{kb}</span>
          {url && !isPdf && (
            <button onClick={() => setFull(true)} aria-label={`View ${label} full size`}
                    className="shrink-0 rounded-[3px] p-1 text-ink-3 transition hover:bg-canvas hover:text-ink">
              <Expand size={13} />
            </button>
          )}
        </figcaption>

        <div className={clsx('grid h-[190px] place-items-center', !url && 'p-3')}>
          {error ? (
            <span className="flex items-center gap-2 text-[12px] text-bad">
              <AlertCircle size={14} /> {error}
            </span>
          ) : !url ? (
            <Skeleton className="h-full w-full" />
          ) : isPdf ? (
            <a href={url} target="_blank" rel="noreferrer"
               className="flex flex-col items-center gap-1.5 text-[12.5px] font-medium text-violet-on hover:underline">
              <FileText size={26} />
              Open PDF
            </a>
          ) : (
            <button onClick={() => setFull(true)} className="h-full w-full">
              {/* the blob is local and already fetched — next/image would add nothing */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={label} className="h-full w-full cursor-zoom-in object-contain" />
            </button>
          )}
        </div>
      </figure>

      <Modal open={full} onClose={() => setFull(false)} title={label} width="lg">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="max-h-[70vh] w-full rounded-[4px] object-contain" />
        )}
      </Modal>
    </>
  );
}
