'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Losing and regaining the connection.
 *
 * The offline toast is deliberately persistent — being offline is a condition,
 * not an event, and a message that disappears after four seconds leaves someone
 * wondering why the page stopped working. That only holds together if something
 * takes it down again, which is this.
 *
 * Coming back online also refetches. Every query that failed while the
 * connection was gone is holding a stale or empty result, and on a screen
 * showing a balance, silently keeping the last thing that loaded is the wrong
 * default.
 */
export function ConnectionWatch() {
  const qc = useQueryClient();

  useEffect(() => {
    const offline = () => {
      toast.error('You are offline', {
        id: 'offline',
        description: 'Changes cannot be saved until the connection returns.',
        duration: Infinity,
      });
    };

    const online = () => {
      toast.dismiss('offline');
      toast.success('Back online', { id: 'online', duration: 2_500 });
      void qc.refetchQueries({ type: 'active' });
    };

    window.addEventListener('offline', offline);
    window.addEventListener('online', online);

    // Mounting while already offline is the common case on a phone.
    if (navigator.onLine === false) offline();

    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [qc]);

  return null;
}
