import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { toFriendlyError, apiErrorMessage, isSessionExpiry } from '@/lib/errors';

/**
 * What the member is told when something fails.
 *
 * This is the whole of the frontend's error vocabulary, and on a platform
 * holding people's money the distinction that matters most is between "the
 * server refused" and "the request never arrived". The first means their
 * instruction was considered and declined; the second means nothing happened
 * at all and it is safe to try again. Blurring them is how somebody submits a
 * withdrawal twice.
 */

const headers = new AxiosHeaders();
const config = { headers };

/** An axios error carrying a real API envelope. */
function served(status: number, body: unknown) {
  return new AxiosError(
    `Request failed with status code ${status}`,
    String(status),
    config,
    {},
    { status, statusText: '', data: body, headers, config },
  );
}

/** An axios error with no response at all — the request never landed. */
const transport = (code: string) => new AxiosError('Network Error', code, config, {});

describe('the server refused', () => {
  it('leads with the sentence the API wrote', () => {
    const f = toFriendlyError(served(400, {
      error: { code: 'INSUFFICIENT_FUNDS', message: 'Minimum withdrawal is $10' },
    }));

    expect(f.message).toBe('Minimum withdrawal is $10');
    expect(f.code).toBe('INSUFFICIENT_FUNDS');
    expect(f.status).toBe(400);
  });

  it('does not offer a retry on a refusal', () => {
    /**
     * "Insufficient funds" will say the same thing the second time. Offering a
     * retry there is only a slower way to be told no — and on a money screen it
     * invites someone to keep pressing until something different happens.
     */
    for (const status of [400, 403, 404, 409, 413, 422]) {
      expect(toFriendlyError(served(status, { error: { message: 'no' } })).retryable).toBe(false);
    }
  });

  it('names the field that failed validation', () => {
    const f = toFriendlyError(served(422, {
      error: {
        message: 'Validation failed',
        details: [{ path: ['walletAddress'], message: 'Not a valid BEP-20 address' }],
      },
    }));

    expect(f.message).toBe('Validation failed');
    expect(f.detail).toBe('walletAddress: Not a valid BEP-20 address');
  });

  it('asks the member to wait when they are rate limited', () => {
    const f = toFriendlyError(served(429, { error: { message: 'Too many attempts' } }));
    expect(f.message).toBe('Too many attempts');
    expect(f.detail).toMatch(/wait/i);
    // Worth retrying, unlike a refusal — just not yet.
    expect(f.retryable).toBe(true);
  });
});

describe('the request never arrived', () => {
  it('says so, and says nothing was submitted', () => {
    /**
     * The old behaviour surfaced axios's own text — "Network Error" — on a
     * withdrawal screen. It is accurate and tells the member nothing about
     * whether their money moved.
     */
    const f = toFriendlyError(transport('ERR_NETWORK'));

    expect(f.message).toMatch(/cannot reach the server|offline/i);
    expect(f.detail).toMatch(/nothing was submitted/i);
    expect(f.offline).toBe(true);
    expect(f.retryable).toBe(true);
  });

  it('distinguishes a timeout from an unreachable server', () => {
    const f = toFriendlyError(transport('ECONNABORTED'));
    expect(f.message).toBe('That took too long');
    expect(f.detail).toMatch(/nothing was submitted/i);
    expect(f.offline).toBe(false);
  });

  it('never shows the raw axios message', () => {
    for (const code of ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT']) {
      expect(toFriendlyError(transport(code)).message).not.toMatch(/timeout of|Network Error/);
    }
  });
});

describe('something broke on our side', () => {
  it('carries the request id, because that is the only thread back to the log', () => {
    const f = toFriendlyError(served(500, {
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: 'abc-123' },
    }));

    expect(f.requestId).toBe('abc-123');
    expect(f.detail).toContain('abc-123');
    expect(f.retryable).toBe(true);
  });

  it('does not repeat an internal message the API withheld', () => {
    // In production the API deliberately returns no detail on a 500. There is
    // nothing to lead with, so it must not pretend there is.
    const f = toFriendlyError(served(500, { error: { requestId: 'r1' } }));
    expect(f.message).toBe('Something went wrong on our side');
  });
});

describe('things that are not axios errors at all', () => {
  it('reads a plain Error', () => {
    expect(toFriendlyError(new Error('Cannot read properties of undefined')).message)
      .toBe('Cannot read properties of undefined');
  });

  it('survives a thrown string, a null and an object', () => {
    expect(toFriendlyError('boom').message).toBe('boom');
    expect(toFriendlyError(null).message).toBe('Something went wrong');
    expect(toFriendlyError({}).message).toBe('Something went wrong');
    expect(toFriendlyError(undefined).message).toBe('Something went wrong');
  });

  it('never returns an empty headline', () => {
    // A toast with no title is a blank grey box, which is worse than a generic
    // sentence: it reads as the app breaking twice.
    for (const thrown of [new Error(''), '', null, undefined, {}, 0]) {
      expect(toFriendlyError(thrown).message.length).toBeGreaterThan(0);
    }
  });
});

describe('session expiry', () => {
  it('is recognised so it can be left to the interceptor', () => {
    // The axios interceptor already refreshes or bounces to login. Toasting it
    // as well tells the member their session ended while the page is already
    // navigating away.
    expect(isSessionExpiry(served(401, { error: { message: 'Missing bearer token' } }))).toBe(true);
    expect(isSessionExpiry(served(403, { error: { message: 'Forbidden' } }))).toBe(false);
    expect(isSessionExpiry(new Error('nope'))).toBe(false);
  });
});

describe('the one-line form', () => {
  it('is the headline and nothing else', () => {
    expect(apiErrorMessage(served(400, { error: { message: 'Withdrawals are closed' } })))
      .toBe('Withdrawals are closed');
  });
});
