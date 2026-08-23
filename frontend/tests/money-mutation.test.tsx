import { describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMoneyMutation } from '@/lib/money-mutation';

/**
 * The idempotency key's lifecycle.
 *
 * The server refuses any money-moving request without an `Idempotency-Key`, and
 * uses it to tell a retry apart from a second, deliberate instruction. That
 * makes this hook's contract narrow and unforgiving:
 *
 *   • **A retry of one submission must reuse the key** — otherwise the server
 *     sees a fresh instruction and the member is charged twice.
 *   • **A genuinely new submission must not** — otherwise the second purchase
 *     looks like a replay of the first and is silently swallowed.
 *
 * Both failures are silent and both involve somebody's money, which is why
 * they are tested here rather than assumed.
 */

/**
 * The shape of a money mutationFn: the caller's variables, then the key.
 * Typed explicitly so `mock.calls[n][1]` is known to exist — an untyped
 * `vi.fn(async () => …)` infers a zero-argument tuple.
 */
type MoneyFn = (vars: void, idempotencyKey: string) => Promise<{ ok: boolean }>;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe('useMoneyMutation', () => {
  it('sends a key at all', async () => {
    const fn = vi.fn<MoneyFn>(async () => ({ ok: true }));
    const { result } = renderHook(() => useMoneyMutation({ mutationFn: fn }), { wrapper });

    await act(async () => { await result.current.mutateAsync(); });

    expect(fn).toHaveBeenCalledTimes(1);
    const key = fn.mock.calls[0]![1];
    expect(key).toBeTruthy();
    expect(key.length).toBeGreaterThanOrEqual(16);
  });

  it('keeps one key for the whole of a single submission', async () => {
    // Two attempts at the same intent — a network blip, then success. The
    // server must recognise the second as the same instruction.
    let attempt = 0;
    const fn = vi.fn<MoneyFn>(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('network');
      return { ok: true };
    });

    const { result } = renderHook(() => useMoneyMutation({ mutationFn: fn }), { wrapper });

    await act(async () => { await result.current.mutateAsync().catch(() => undefined); });
    await act(async () => { await result.current.mutateAsync(); });

    expect(fn).toHaveBeenCalledTimes(2);

    /**
     * The same key both times.
     *
     * This is the case that matters. A dropped connection does not tell the
     * client whether the server processed the request — and if it did, the key
     * is recorded as completed, so retrying with it returns the original result
     * instead of charging again. Rotating here would turn an ambiguous failure
     * into a duplicate purchase.
     */
    expect(fn.mock.calls[1]![1]).toBe(fn.mock.calls[0]![1]);
  });

  it('keeps the key after a refusal, so a corrected resubmission is the same intent', async () => {
    // The server deletes the key on any non-2xx, so reusing it is safe and
    // means a member fixing a typo is still submitting one instruction.
    const fn = vi.fn<MoneyFn>(async () => { throw new Error('Minimum withdrawal is $10'); });
    const { result } = renderHook(() => useMoneyMutation({ mutationFn: fn }), { wrapper });

    await act(async () => { await result.current.mutateAsync().catch(() => undefined); });
    await act(async () => { await result.current.mutateAsync().catch(() => undefined); });

    expect(fn.mock.calls[1]![1]).toBe(fn.mock.calls[0]![1]);
  });

  it('rotates the key once a submission has succeeded', async () => {
    /**
     * A member buying the same package twice on purpose is two instructions.
     * Reusing the key would make the second one collide with the first on the
     * server's unique index and be discarded as a replay — they would be
     * charged once and see one package, with nothing explaining the other.
     */
    const fn = vi.fn<MoneyFn>(async () => ({ ok: true }));
    const { result } = renderHook(() => useMoneyMutation({ mutationFn: fn }), { wrapper });

    await act(async () => { await result.current.mutateAsync(); });
    await act(async () => { await result.current.mutateAsync(); });

    const [first, second] = [fn.mock.calls[0]![1], fn.mock.calls[1]![1]];
    expect(first).not.toBe(second);
  });

  it('gives every hook instance its own key', async () => {
    // Two forms open at once — a deposit and a withdrawal — must never share a
    // key, or the second would be read as a replay of the first.
    const a = vi.fn<MoneyFn>(async () => ({ ok: true }));
    const b = vi.fn<MoneyFn>(async () => ({ ok: true }));

    const one = renderHook(() => useMoneyMutation({ mutationFn: a }), { wrapper });
    const two = renderHook(() => useMoneyMutation({ mutationFn: b }), { wrapper });

    await act(async () => { await one.result.current.mutateAsync(); });
    await act(async () => { await two.result.current.mutateAsync(); });

    expect(a.mock.calls[0]![1]).not.toBe(b.mock.calls[0]![1]);
  });

  it("still runs the caller's own callbacks", async () => {
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const fn = vi.fn<MoneyFn>(async () => ({ ok: true }));
    const { result } = renderHook(
      () => useMoneyMutation({ mutationFn: fn, onSuccess, onSettled }), { wrapper },
    );

    await act(async () => { await result.current.mutateAsync(); });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it('produces a key even without a secure context', async () => {
    // crypto.randomUUID is unavailable over plain http, which is exactly how
    // the app is reached when testing from a phone on the LAN. Without the
    // fallback every money action on that device would fail.
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: original.getRandomValues.bind(original) },
      configurable: true,
    });

    try {
      const fn = vi.fn<MoneyFn>(async () => ({ ok: true }));
      const { result } = renderHook(() => useMoneyMutation({ mutationFn: fn }), { wrapper });
      await act(async () => { await result.current.mutateAsync(); });

      expect(fn.mock.calls[0]![1]).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});
