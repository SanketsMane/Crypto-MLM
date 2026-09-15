'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Maximize2, Menu, Search, LogOut, User } from 'lucide-react';
import { CommandPalette, useCommandPalette } from '@/features/search/command-palette';
import { adminSearch } from '@/features/search/clients';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { adminTransport } from '@/features/notifications/transports';
import { adminToken, adminLogout } from '@/lib/admin-api';
import { useAdmin } from '@/features/admin/use-admin';
import { ThemeToggle } from './theme-toggle';

export function TopHeader({ onToggleSidebar, onOpenMobile }: { onToggleSidebar: () => void; onOpenMobile: () => void }) {
  const router = useRouter();
  const { admin } = useAdmin();
  const [menu, setMenu] = useState(false);
  const { open: searchOpen, setOpen: setSearchOpen } = useCommandPalette();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  return (
    <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-3 border-b border-line bg-card px-4 sm:px-6">
      <button onClick={onToggleSidebar} aria-label="Toggle sidebar"
              className="hidden h-10 w-10 place-items-center rounded-full bg-navy text-white transition hover:bg-navy-soft dark:bg-white/[0.07] dark:text-ink dark:hover:bg-white/[0.12] lg:grid">
        <Menu size={18} />
      </button>
      <button onClick={onOpenMobile} aria-label="Open menu"
              className="grid h-10 w-10 place-items-center rounded-full bg-navy text-white transition dark:bg-white/[0.07] dark:text-ink dark:hover:bg-white/[0.12] lg:hidden">
        <Menu size={18} />
      </button>

      {/* A button, not an input: search opens a palette, so a text field here
          would only be a decoy that swallows the first keystroke. */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="relative hidden min-w-0 flex-1 items-center gap-2.5 rounded-full border border-field-line bg-canvas px-4 text-left transition hover:border-gold/50 md:flex md:max-w-[380px] md:h-11"
      >
        <Search size={16} className="shrink-0 text-ink-3" />
        <span className="truncate text-[13.5px] text-field-ph">Search members, transactions…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3 lg:block">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search"
        className="grid h-10 w-10 place-items-center rounded-full text-ink-2 transition hover:bg-canvas hover:text-ink md:hidden"
      >
        <Search size={19} />
      </button>

      <CommandPalette client={adminSearch} open={searchOpen} onClose={() => setSearchOpen(false)} />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
        <NotificationBell transport={adminTransport} settingsHref="/admin/settings#notifications" variant="admin" />
        {/* compact on desktop; on phones it moves into the profile menu below
            so it never competes with the avatar for navbar width. The wrapper
            owns the visibility — putting `hidden` on the toggle itself would
            collide with the toggle's own `inline-flex`. */}
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>

        <button onClick={fullscreen} aria-label="Fullscreen" className="hidden h-10 w-10 place-items-center rounded-full text-ink-2 transition hover:bg-canvas hover:text-ink sm:grid">
          <Maximize2 size={18} />
        </button>

        <div ref={ref} className="relative">
          <button onClick={() => setMenu((m) => !m)}
                  className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition hover:bg-canvas">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-gold to-gold-hi text-[13px] font-bold text-gold-on">
              {(admin?.name ?? 'A').slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[13.5px] font-semibold text-ink">{admin?.name ?? 'Admin'}</span>
              <span className="block text-[11.5px] text-ink-2">{admin?.role.name ?? '—'}</span>
            </span>
            <ChevronDown size={15} className="hidden text-ink-3 sm:block" />
          </button>

          {menu && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-[5px] border border-line bg-card shadow-pop">
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-[13px] font-semibold text-ink">{admin?.name}</p>
                <p className="truncate text-[11.5px] text-ink-2">{admin?.email}</p>
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:hidden">
                <span className="text-[13px] text-ink-2">Appearance</span>
                <ThemeToggle size="sm" />
              </div>
              <button onClick={() => { setMenu(false); router.push('/admin/access'); }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-ink-2 transition hover:bg-canvas hover:text-ink">
                <User size={15} /> Roles &amp; access
              </button>
              <button onClick={async () => { await adminLogout(); router.push('/admin/login'); }}
                      className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-[13px] text-bad transition hover:bg-bad-soft">
                <LogOut size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
