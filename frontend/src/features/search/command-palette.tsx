'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, CornerDownLeft } from 'lucide-react';
import { clsx } from 'clsx';

export interface Hit { id: string; title: string; subtitle: string; href: string; badge?: string }
export interface Group { key: string; label: string; hits: Hit[] }

export interface SearchClient {
  get: <T>(url: string, params?: Record<string, unknown>) => Promise<T>;
  base: string;
  scope: string;
  placeholder: string;
}

/**
 * The search the header has always claimed to have.
 *
 * A palette rather than an inline dropdown: search here is mostly navigation,
 * and navigation wants the keyboard. Cmd/Ctrl+K opens it from anywhere, arrows
 * move, Enter goes, Escape leaves — so the fastest path never touches the mouse.
 *
 * Results are grouped rather than merged into one ranked list, because a query
 * like "FX1234" is genuinely ambiguous between a member and a reference, and
 * showing both under headings beats guessing.
 */
export function CommandPalette({
  client,
  open,
  onClose,
}: {
  client: SearchClient;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounced, so typing a member code does not fire six queries.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  const results = useQuery<{ groups: Group[] }>({
    queryKey: [client.scope, 'search', debounced],
    queryFn: () => client.get(client.base, { q: debounced }),
    enabled: debounced.trim().length >= 2,
    staleTime: 15_000,
  });

  /** Flattened, because arrow keys move through hits and not through headings. */
  const flat = useMemo(
    () => (results.data?.groups ?? []).flatMap((g) => g.hits),
    [results.data],
  );

  useEffect(() => { setCursor(0); }, [debounced]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setDebounced('');
      // Next frame, or the element is not focusable yet.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const go = (hit: Hit) => { onClose(); router.push(hit.href); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (!flat.length) return;

    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % flat.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + flat.length) % flat.length); }
    else if (e.key === 'Enter') { e.preventDefault(); const hit = flat[cursor]; if (hit) go(hit); }
  };

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const short = query.trim().length > 0 && query.trim().length < 2;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-navy/40 backdrop-blur-[2px] dark:bg-black/60"
      />

      <div
        onKeyDown={onKeyDown}
        className="relative w-full max-w-xl overflow-hidden rounded-[14px] border border-line bg-card shadow-[0_24px_70px_-20px_rgba(7,20,38,0.45)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={client.placeholder}
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-field-ph"
          />
          {results.isFetching && <Loader2 size={15} className="shrink-0 animate-spin text-ink-3" />}
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3 sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain">
          {short ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-3">Keep typing…</p>
          ) : !debounced ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-3">{client.placeholder}</p>
          ) : results.isLoading ? (
            <div className="grid place-items-center py-10 text-ink-3">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : !flat.length ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-2">
              Nothing matches “{debounced}”.
            </p>
          ) : (
            (() => {
              let index = -1;
              return (results.data?.groups ?? []).map((g) => (
                <section key={g.key}>
                  <h3 className="px-4 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                    {g.label}
                  </h3>
                  <ul>
                    {g.hits.map((hit) => {
                      index += 1;
                      const active = index === cursor;
                      const at = index;
                      return (
                        <li key={hit.id}>
                          <button
                            type="button"
                            data-active={active}
                            onMouseEnter={() => setCursor(at)}
                            onClick={() => go(hit)}
                            className={clsx(
                              'flex w-full items-center gap-3 px-4 py-2.5 text-left transition',
                              active ? 'bg-canvas' : 'hover:bg-canvas',
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium text-ink">
                                {hit.title}
                              </span>
                              <span className="block truncate text-[11.5px] text-ink-3">
                                {hit.subtitle}
                              </span>
                            </span>
                            {hit.badge && (
                              <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[10.5px] font-medium text-ink-2">
                                {hit.badge}
                              </span>
                            )}
                            {active && <CornerDownLeft size={13} className="shrink-0 text-ink-3" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ));
            })()
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1"><kbd className="rounded border border-line px-1">↑</kbd><kbd className="rounded border border-line px-1">↓</kbd> move</span>
          <span className="inline-flex items-center gap-1"><kbd className="rounded border border-line px-1">↵</kbd> open</span>
        </footer>
      </div>
    </div>
  );
}

/** Wires Cmd/Ctrl+K globally, and the "/" shortcut when nothing else has focus. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" is a search shortcut everywhere except inside a field someone is
      // already typing in.
      const el = document.activeElement;
      const typing = el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { open, setOpen };
}
