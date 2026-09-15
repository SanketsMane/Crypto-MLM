'use client';

import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button, Card } from '@/components/ui/primitives';
import { toFriendlyError } from '@/lib/errors';

/**
 * What a member sees when a screen could not render or could not load.
 *
 * Two things it deliberately does, because this is a platform holding people's
 * money and a broken screen is frightening:
 *
 *   • **Says nothing happened to their money.** A blank page with "Error" on it
 *     invites the worst interpretation. A failure to *display* a balance is not
 *     a failure of the balance, and saying so costs one sentence.
 *   • **Shows the reference.** Every 5xx from the API carries a request id, and
 *     `error.digest` identifies a server render. Either one turns "it broke" in
 *     a support ticket into an exact request in the log.
 */
export function ErrorState({
  error,
  retry,
  title,
  /** Set on a boundary that wraps a whole screen rather than one panel. */
  full,
}: {
  error: unknown;
  retry?: () => void;
  title?: string;
  full?: boolean;
}) {
  const f = toFriendlyError(error);
  const digest = (error as { digest?: string } | undefined)?.digest;
  const reference = f.requestId ?? digest;

  return (
    <Card>
      <div
        role="alert"
        className={`flex flex-col items-center gap-3 px-6 text-center ${full ? 'py-20' : 'py-12'}`}
      >
        <span className="grid h-12 w-12 place-items-center rounded-[5px] bg-bad-soft text-bad">
          <AlertTriangle size={22} />
        </span>

        <h2 className="text-[17px] font-semibold text-ink">{title ?? f.message}</h2>

        {f.detail && (
          <p className="max-w-[52ch] text-[13.5px] leading-relaxed text-ink-2">{f.detail}</p>
        )}

        {/* The reassurance is the point of this component. */}
        <p className="max-w-[52ch] text-[12.5px] leading-relaxed text-ink-3">
          This is a problem showing the page, not with your account. Nothing has been
          changed and no money has moved.
        </p>

        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {retry && (
            <Button onClick={retry} variant="secondary">
              <RotateCcw size={14} /> Try again
            </Button>
          )}
          <Button variant="ghost" onClick={() => window.location.reload()}>
            <RefreshCw size={14} /> Reload the page
          </Button>
        </div>

        {reference && (
          <p className="mt-1 font-mono text-[11px] text-ink-3">
            Reference <span className="select-all text-ink-2">{reference}</span>
          </p>
        )}
      </div>
    </Card>
  );
}
