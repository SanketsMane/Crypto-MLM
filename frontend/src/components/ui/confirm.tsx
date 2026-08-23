'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { ActionDialog, type DialogField } from './dialog';

/**
 * One confirmation gate for the whole console.
 *
 * Before this, whether a destructive action asked twice depended on whether
 * whoever wrote that page remembered to wire up a dialog — so deleting a role
 * asked, and publishing an announcement to every member did not. A per-page
 * decision is exactly the wrong shape for "are you sure": it fails silently and
 * invisibly, on the pages nobody revisited.
 *
 * The hook is imperative on purpose. A guard reads as a guard when it sits on
 * the line that does the thing:
 *
 *     if (!(await confirm({ title: 'Delete this role?', tone: 'danger' }))) return;
 *     remove.mutate(id);
 *
 * It resolves `false` on cancel or Escape, and never throws, so a forgotten
 * `await` degrades to "nothing happened" rather than "it happened anyway".
 */

export interface ConfirmRequest {
  title: string;
  body?: string;
  /** Defaults to "Confirm" — override with the verb, e.g. "Delete role". */
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  /** Reasons an operator must type. Returned in the resolved values. */
  fields?: DialogField[];
}

export interface ConfirmResult {
  ok: boolean;
  values: Record<string, string>;
}

type Resolver = (r: ConfirmResult) => void;

const ConfirmContext = createContext<((req: ConfirmRequest) => Promise<ConfirmResult>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<Resolver | null>(null);

  const settle = useCallback((result: ConfirmResult) => {
    resolver.current?.(result);
    resolver.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback((req: ConfirmRequest) => {
    /* A second request while one is open would strand the first promise, so the
       previous one is resolved as cancelled rather than left hanging. */
    resolver.current?.({ ok: false, values: {} });
    setRequest(req);
    return new Promise<ConfirmResult>((resolve) => { resolver.current = resolve; });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ActionDialog
        open={!!request}
        onClose={() => settle({ ok: false, values: {} })}
        onConfirm={(values) => settle({ ok: true, values })}
        title={request?.title ?? ''}
        body={request?.body}
        confirmLabel={request?.confirmLabel ?? 'Confirm'}
        tone={request?.tone ?? 'danger'}
        fields={request?.fields ?? []}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Ask before doing something that cannot be taken back.
 *
 * Returns `{ ok, values }`. Callers that need no typed reason can use the
 * `ok` alone; `useConfirmOk` below is the shorthand for that case.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

/** `if (!(await confirm({...}))) return;` — when no fields are needed. */
export function useConfirmOk() {
  const confirm = useConfirm();
  return useCallback(
    async (req: ConfirmRequest) => (await confirm(req)).ok,
    [confirm],
  );
}
