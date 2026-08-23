'use client';

import {
  MutationCache, QueryCache, QueryClient, QueryClientProvider,
} from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { toFriendlyError } from '@/lib/errors';
import { ConnectionWatch } from './connection-watch';
import { toastError } from '@/lib/toast';

/**
 * Query and mutation defaults, and the floor under every failure.
 *
 * The reason the caches carry error handlers rather than each screen doing it:
 * there were ninety-nine queries in this app and ten places that showed an
 * error. The other eighty-nine failed silently — a spinner that never stopped,
 * or a table that stayed empty as though there were genuinely nothing there.
 * On a page reporting somebody's balance, "empty" and "we could not load it"
 * are not interchangeable.
 *
 * So the default is now: **a failure is always visible.** A screen that wants
 * to present the error itself still can, and says so; nothing is reported
 * twice.
 */

/** Opt out per query/mutation with `meta: { silent: true }`. */
interface Meta { silent?: boolean; [k: string]: unknown }

/**
 * A 401 is already being handled by the axios interceptor, which refreshes the
 * session or bounces to the login screen. Toasting it as well tells a member
 * their session expired while the page is already navigating away from them.
 */
const handled = (error: unknown) => toFriendlyError(error).status === 401;

/**
 * Never retry an answer.
 *
 * The server saying "insufficient funds" is not a transient condition, and
 * retrying it burns a second or two before showing the same refusal. Transport
 * failures and 5xx are worth one more attempt.
 */
function retry(failureCount: number, error: unknown) {
  const f = toFriendlyError(error);
  if (!f.retryable) return false;
  return failureCount < 2;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry,
        // A failed background refetch must not blank a screen that is already
        // showing good data — the member keeps reading what they had while the
        // toast explains that it may be stale.
        refetchOnWindowFocus: false,
        placeholderData: <T,>(previous: T) => previous,
      },
      mutations: { retry: false },
    },

    queryCache: new QueryCache({
      onError: (error, query) => {
        if ((query.meta as Meta | undefined)?.silent || handled(error)) return;

        /**
         * Keyed on the reason, not on the query.
         *
         * Keying on the query hash collapsed retries of one query but not the
         * common case: a dashboard mounts a dozen queries against the same API,
         * and when that API is rate-limited or down they all fail at once with
         * the same message. The member got a stack of identical toasts, which
         * reads as a dozen problems rather than one. Different reasons still
         * get their own toast, which is the distinction worth keeping.
         */
        void query;
        toastError(error, undefined, `e:${toFriendlyError(error).message}`);
      },
    }),

    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        // A mutation that handles its own errors has usually written a better
        // message than the generic one, or is showing it inline in a form.
        if (mutation.options.onError) return;
        if ((mutation.meta as Meta | undefined)?.silent || handled(error)) return;
        toastError(error);
      },
    }),
  }));

  return (
    <QueryClientProvider client={client}>
      <ConnectionWatch />
      {children}
    </QueryClientProvider>
  );
}
