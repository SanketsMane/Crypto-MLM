import { isAxiosError, type AxiosError } from 'axios';

/**
 * Turning a failure into a sentence.
 *
 * Every error the member or an operator ever sees passes through here, because
 * the alternative is what this replaced: `err.message` straight from axios.
 * That produced "Network Error" and "timeout of 20000ms exceeded" on screens
 * where somebody was trying to move money — technically accurate, useless to
 * act on, and indistinguishable from the platform being broken.
 *
 * Three rules:
 *
 *   1. **The server's sentence wins.** The API writes its errors for the
 *      reader — "Minimum withdrawal is $10", "Verify your identity first". When
 *      one of those arrives, nothing here improves on it.
 *   2. **A transport failure is not a platform failure.** No response at all
 *      means the request never landed, which is a different thing to say and,
 *      crucially, safe to retry. Saying "something went wrong" invites the
 *      member to assume their money moved.
 *   3. **A 5xx carries its request id.** It is the only thread between a member
 *      saying "it broke" and an operator finding the exact request.
 */

export interface ApiErrorShape {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: { path?: (string | number)[]; message?: string }[];
  };
}

export interface FriendlyError {
  /** The sentence to lead with. */
  message: string;
  /** Secondary line — quote-this-to-support, or the first validation problem. */
  detail?: string;
  /** Machine code, where the server sent one. */
  code?: string;
  status?: number;
  requestId?: string;
  /**
   * Whether trying again could plausibly work. A transport failure or a 5xx
   * might; "insufficient funds" never will, and offering a retry there is
   * just a second way to be told no.
   */
  retryable: boolean;
  /** The request never reached the server, so nothing happened. */
  offline: boolean;
}

const GENERIC = 'Something went wrong';

/** True when the browser itself says there is no connection. */
const browserOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Status codes that mean "the server heard you and said no".
 *
 * These are answers, not faults, and their message is written to be read.
 */
const ANSWERED = new Set([400, 402, 403, 404, 405, 409, 410, 413, 422, 423]);

export function toFriendlyError(e: unknown): FriendlyError {
  // Not an axios error at all — a bug in our own code, a thrown string, an
  // aborted render. Nothing useful to extract beyond the message.
  if (!isAxiosError(e)) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : GENERIC;
    return { message: message || GENERIC, retryable: false, offline: false };
  }

  const err = e as AxiosError<ApiErrorShape>;
  const status = err.response?.status;
  const body = err.response?.data?.error;
  const requestId = body?.requestId;

  // ── nothing came back ────────────────────────────────────────────────────
  if (!err.response) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return {
        message: 'That took too long',
        detail: 'The server did not answer in time. Nothing was submitted — try again.',
        code: err.code,
        retryable: true,
        offline: false,
      };
    }
    if (err.code === 'ERR_CANCELED') {
      return { message: 'Cancelled', code: err.code, retryable: true, offline: false };
    }
    return {
      message: browserOffline() ? 'You are offline' : 'Cannot reach the server',
      detail: browserOffline()
        ? 'Check your connection. Nothing was submitted.'
        : 'The request never arrived, so nothing was submitted. Try again in a moment.',
      code: err.code,
      retryable: true,
      offline: true,
    };
  }

  // ── the server answered ──────────────────────────────────────────────────
  const served = body?.message?.trim();

  if (status === 422) {
    // Lead with the server's summary and name the first field that failed,
    // rather than making somebody hunt for it.
    const first = body?.details?.[0];
    const field = first?.path?.filter((p) => typeof p === 'string').join('.');
    return {
      message: served || 'Check the form',
      detail: first?.message ? (field ? `${field}: ${first.message}` : first.message) : undefined,
      code: body?.code, status, requestId, retryable: false, offline: false,
    };
  }

  if (status === 429) {
    return {
      message: served || 'Too many attempts',
      detail: 'Wait a moment before trying again.',
      code: body?.code, status, requestId, retryable: true, offline: false,
    };
  }

  if (status === 401) {
    return {
      message: served || 'Your session has ended',
      detail: served ? undefined : 'Sign in again to continue.',
      code: body?.code, status, requestId, retryable: false, offline: false,
    };
  }

  if (status && ANSWERED.has(status)) {
    return {
      message: served || GENERIC,
      code: body?.code, status, requestId, retryable: false, offline: false,
    };
  }

  // 5xx and anything unrecognised. In production the API deliberately does not
  // return the internal message, so there is usually nothing to lead with —
  // but there is always a request id, and it is the whole reason to show one.
  return {
    message: served && status && status < 500 ? served : 'Something went wrong on our side',
    detail: requestId ? `Quote reference ${requestId} if you contact support.` : undefined,
    code: body?.code,
    status,
    requestId,
    retryable: true,
    offline: false,
  };
}

/**
 * Just the headline, for the many places that only have room for one line.
 *
 * Kept as its own export because it is what the existing call sites use, and
 * changing them all to destructure an object would be churn for no gain.
 */
export const apiErrorMessage = (e: unknown): string => toFriendlyError(e).message;

/** A 401 that the axios interceptor is already handling by bouncing to login. */
export const isSessionExpiry = (e: unknown): boolean =>
  isAxiosError(e) && e.response?.status === 401;

/**
 * Does this error mean "you are not signed in"?
 *
 * The distinction that matters to a session guard. A 401 or 403 is the server
 * saying the credential is no good; anything else — a dropped connection, a
 * timeout, a 500 — says nothing about the session at all.
 *
 * Treating the second as the first signs a member out because their train went
 * into a tunnel, discarding whatever they were in the middle of.
 */
export function isAuthFailure(e: unknown): boolean {
  const status = toFriendlyError(e).status;
  return status === 401 || status === 403;
}
