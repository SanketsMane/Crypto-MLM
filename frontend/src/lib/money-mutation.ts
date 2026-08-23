'use client';

import { useCallback, useRef } from 'react';
import { useMutation, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';

/**
 * A mutation that moves money.
 *
 * Endpoints that move money require an `Idempotency-Key`, so that a retried or
 * double-submitted request is recognised as the same intent instead of being
 * executed twice.
 *
 * The key rotates on **success only**, and that distinction is the whole point:
 *
 *   • **Succeeded** — the intent is complete. A second purchase of the same
 *     package is a genuinely new instruction and needs a new key, or the server
 *     would recognise it as a replay and silently return the first result.
 *
 *   • **Failed** — keep the key. This used to rotate on settle, which fires on
 *     errors too, and that is precisely backwards. The dangerous case is a
 *     request that reached the server and succeeded while the response was lost
 *     to a dropped connection: the server has recorded the key as completed, so
 *     retrying with it returns the original result and nothing is charged
 *     twice. Retrying with a *fresh* key executes the purchase again. A refused
 *     request is safe either way — the server deletes the key on any non-2xx
 *     response, so resubmitting a corrected intent under the same key works.
 *
 *   const buy = useMoneyMutation({
 *     mutationFn: (packageId: string, key) =>
 *       post('/investments/purchase', { packageId }, key),
 *   });
 */
export function useMoneyMutation<TData, TVars = void, TError = unknown>(
  options: Omit<UseMutationOptions<TData, TError, TVars>, 'mutationFn'> & {
    mutationFn: (vars: TVars, idempotencyKey: string) => Promise<TData>;
  },
): UseMutationResult<TData, TError, TVars> {
  const { mutationFn, onSuccess, ...rest } = options;
  const keyRef = useRef<string>(newKey());

  const succeeded = useCallback<NonNullable<typeof onSuccess>>(
    (...args) => {
      // Only here. On failure the key is deliberately kept so a retry is
      // recognised as the same instruction rather than a second one.
      keyRef.current = newKey();
      return onSuccess?.(...args);
    },
    [onSuccess],
  );

  return useMutation<TData, TError, TVars>({
    ...rest,
    onSuccess: succeeded,
    mutationFn: (vars) => mutationFn(vars, keyRef.current),
  });
}

/** crypto.randomUUID needs a secure context; the fallback keeps LAN dev working. */
function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
