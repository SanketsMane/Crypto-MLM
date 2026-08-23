'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/error-state';

/**
 * Catches a render failure inside this area without taking down the shell.
 *
 * The navigation and the header live in the layout above, which this boundary
 * deliberately does not wrap — so a broken screen leaves the member somewhere
 * they can navigate out of, rather than on a dead page.
 */
export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Server-rendered errors arrive with only a digest; the log has the rest.
    console.error(error);
  }, [error]);

  return <ErrorState error={error} retry={retry} full />;
}
