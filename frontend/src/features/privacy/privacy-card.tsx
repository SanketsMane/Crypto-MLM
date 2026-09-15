'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileCheck2, ExternalLink, Loader2 } from 'lucide-react';
import { get, post, getBlob } from '@/lib/api';
import { Card, CardHead, Button, Badge, Skeleton } from '@/components/ui/primitives';
import { toastError } from '@/lib/toast';

type Doc = 'TERMS' | 'PRIVACY' | 'RISK_DISCLOSURE';

interface ConsentDoc {
  document: Doc; label: string; path: string;
  currentVersion: string; accepted: boolean; acceptedAt: string | null;
  outdated: boolean; previousVersion: string | null;
}

/**
 * What the member agreed to, and a copy of what we hold on them.
 *
 * Both are the same idea: a member's relationship with a platform holding their
 * money should not be something only the platform can see.
 */
export function PrivacyCard() {
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);

  const status = useQuery<{ documents: ConsentDoc[]; allAccepted: boolean }>({
    queryKey: ['member', 'consents'],
    queryFn: () => get('/privacy/consents'),
  });

  const accept = useMutation({
    mutationFn: (documents: Doc[]) => post('/privacy/consents', { documents }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', 'consents'] });
      toast.success('Recorded');
    },
    onError: (e) => toastError(e),
  });

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await getBlob('/privacy/export');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `account-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Your data has been downloaded');
    } catch (e) {
      toastError(e);
    } finally {
      setDownloading(false);
    }
  };

  const outstanding = (status.data?.documents ?? []).filter((d) => !d.accepted);

  return (
    <Card>
      <CardHead
        title="Your data and agreements"
        subtitle="What you have agreed to, and a copy of everything we hold."
      />
      <div className="space-y-4 px-5 pb-5">
        {status.isLoading ? <Skeleton className="h-28" /> : (
          <>
            <ul className="divide-y divide-line">
              {(status.data?.documents ?? []).map((d) => (
                <li key={d.document} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                      {d.label}
                      <Link href={d.path} target="_blank"
                            className="text-ink-3 transition hover:text-ink"
                            aria-label={`Read the ${d.label.toLowerCase()}`}>
                        <ExternalLink size={11} />
                      </Link>
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-ink-3">
                      {d.accepted
                        ? `Version ${d.currentVersion}, accepted ${new Date(d.acceptedAt!).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : d.outdated
                          ? `You accepted version ${d.previousVersion}. Version ${d.currentVersion} is now in force.`
                          : `Version ${d.currentVersion}`}
                    </p>
                  </div>
                  <Badge tone={d.accepted ? 'good' : d.outdated ? 'warn' : 'neutral'}>
                    {d.accepted ? 'Accepted' : d.outdated ? 'Updated' : 'Not accepted'}
                  </Badge>
                </li>
              ))}
            </ul>

            {outstanding.length > 0 && (
              <Button
                loading={accept.isPending}
                onClick={() => accept.mutate(outstanding.map((d) => d.document))}
              >
                <FileCheck2 size={14} />
                Accept {outstanding.length === 1 ? 'the updated document' : 'all updated documents'}
              </Button>
            )}

            <div className="flex flex-wrap items-start gap-3 rounded-[5px] border border-line bg-canvas px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[4px] bg-gold-soft text-gold">
                <Download size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-ink">Download your data</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">
                  Every transaction, investment, payout, ticket and sign-in we hold, as one file.
                  Passwords and security keys are not included — they are stored in a form that
                  cannot be read back.
                </p>
              </div>
              <Button variant="outline" onClick={() => void download()} disabled={downloading}>
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Download
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
