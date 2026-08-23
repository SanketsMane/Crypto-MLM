'use client';

import { toast as sonner } from 'sonner';
import { toFriendlyError } from './errors';

/**
 * Toast helpers.
 *
 * Sonner is used directly nearly everywhere, which is fine — these exist for
 * the two cases worth standardising:
 *
 *   • **Errors linger.** A confirmation is a courtesy; the screen already shows
 *     what happened. An error is the only place the reason appears, and the
 *     default four seconds is not long enough to read a sentence and decide
 *     what to do about it.
 *
 *   • **The reason comes from the server.** Every API error carries a message
 *     written for the reader; showing "Something went wrong" instead throws it
 *     away.
 */

const ERROR_MS = 8_000;

/**
 * Reports a failure, leading with the server's own explanation.
 *
 * The API writes its errors for the reader — "Minimum withdrawal is $10",
 * "Verify your identity before withdrawing" — so that sentence is the title.
 * Replacing it with a generic heading and demoting the real reason to small
 * grey text is how a clear error becomes a support ticket.
 *
 * `context` is optional and only worth passing when the screen alone does not
 * make it obvious which action failed.
 */
export const toastError = (
  error: unknown,
  context?: string,
  /**
   * Collapses repeats onto one toast.
   *
   * A dashboard mounts a dozen queries against the same API; when it is down
   * they all fail within a few hundred milliseconds. Without this the member
   * gets a dozen stacked toasts saying the same thing, which reads as twelve
   * problems rather than one.
   */
  dedupeKey?: string,
) => {
  const f = toFriendlyError(error);

  // Offline collapses to a single toast whatever failed, and stays up: it is
  // a condition, not an event, and it clears when the connection returns.
  const id = f.offline ? 'offline' : dedupeKey;

  // The caller's context only earns the description line when the error has
  // nothing more specific to say. A request id beats "Could not save".
  return sonner.error(f.message, {
    description: f.detail ?? context,
    duration: f.offline ? Infinity : ERROR_MS,
    id,
  });
};

/** Reports a money action, which stays up longer than a routine confirmation. */
export const toastMoney = (message: string, description?: string) =>
  sonner.success(message, { description, duration: 6_000 });

export { sonner as toast };
