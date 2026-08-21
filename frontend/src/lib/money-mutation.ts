'use client';

import { useCallback, useRef } from 'react';
import { useMutation, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';

/**
 * A mutation that moves money.
 *
 * Endpoints that move money require an `Idempotency-Key`, so that a retried or
 * double-submitted request is recognised as the same intent instead of being
 * executed twice. The key has to stay stable for as long as one submission is
 * in flight, and change once that submission has resolved — otherwise a second,
 * genuinely different purchase would look like a replay of the first.
 *
 * That is exactly the lifecycle of this hook: the key is held in a ref, handed
 * to every attempt, and rotated on settle.
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
  const { mutationFn, onSettled, ...rest } = options;
  const keyRef = useRef<string>(newKey());

  const settled = useCallback<NonNullable<typeof onSettled>>(
    (...args) => {
      keyRef.current = newKey();
      return onSettled?.(...args);
    },
    [onSettled],
  );

  return useMutation<TData, TError, TVars>({
    ...rest,
    onSettled: settled,
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
