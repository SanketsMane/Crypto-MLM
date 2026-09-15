'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Copy, LogOut, Menu, Search, User } from 'lucide-react';
import { CommandPalette, useCommandPalette } from '@/features/search/command-palette';
import { memberSearch } from '@/features/search/clients';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { memberTransport } from '@/features/notifications/transports';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { useLogout } from '@/features/auth/use-auth';

export function MemberHeader({ member, onToggleSidebar, onOpenMobile }: {
  member?: { name: string; userCode: string; referralLink: string; rank: { name: string } | null };
  onToggleSidebar: () => void;
  onOpenMobile: () => void;
}) {
  const router = useRouter();
  const logout = useLogout();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const { open: searchOpen, setOpen: setSearchOpen } = useCommandPalette();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const copyLink = async () => {
    if (!member?.referralLink) return;
    try {
      await navigator.clipboard.writeText(member.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <header className="sticky top-0 z-30 flex h-[48px] shrink-0 items-center gap-3 border-b border-line bg-canvas-2 px-3 sm:px-4">
      <button onClick={onToggleSidebar} aria-label="Toggle sidebar"
              className="hidden h-8 w-8 place-items-center rounded-[4px] border border-line text-ink-2 transition hover:border-line-strong hover:text-ink lg:grid">
        <Menu size={18} />
      </button>
      <button onClick={onOpenMobile} aria-label="Open menu"
              className="grid h-8 w-8 place-items-center rounded-[4px] border border-line text-ink-2 lg:hidden">
        <Menu size={18} />
      </button>

      {/* A button, not an input: search opens a palette, so a text field here
          would only be a decoy that swallows the first keystroke. */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="relative hidden h-8 min-w-0 flex-1 items-center gap-2 rounded-[4px] border border-line bg-field px-2.5 text-left transition hover:border-line-strong md:flex md:max-w-[300px]"
      >
        <Search size={14} className="shrink-0 text-ink-3" />
        <span className="truncate text-[12px] text-ink-3">Search packages, income, team…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-3 lg:block">
          ⌘K
        </kbd>
      </button>

      <CommandPalette client={memberSearch} open={searchOpen} onClose={() => setSearchOpen(false)} />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
        {/* referral link is the member's most-used action — give it a home in the chrome */}
        <button onClick={copyLink} title="Copy your referral link"
          className="hidden h-8 items-center gap-1.5 rounded-[4px] border border-line px-2.5 text-[11.5px] font-medium text-ink-2 transition hover:border-gold/50 hover:text-ink lg:inline-flex">
          {copied ? <Check size={14} className="text-good" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Invite link'}
        </button>

        {/* On phones the palette is reachable from an icon, since the wide
            trigger above is hidden. */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          className="grid h-8 w-8 place-items-center rounded-[4px] text-ink-2 transition hover:bg-card-2 hover:text-ink md:hidden"
        >
          <Search size={19} />
        </button>

        <ThemeToggle />

        <NotificationBell transport={memberTransport} settingsHref="/security#notifications" />

        <div ref={ref} className="relative">
          <button onClick={() => setMenu((m) => !m)}
                  className="flex items-center gap-2 rounded-[4px] py-0.5 pl-0.5 pr-1.5 transition hover:bg-card-2">
            <span className="grid h-7 w-7 place-items-center rounded-[4px] bg-card-2 border border-line font-mono text-[11px] font-semibold text-ink-2">
              {(member?.name ?? 'M').slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[12.5px] font-semibold text-ink">{member?.name ?? 'Member'}</span>
              <span className="block font-mono text-[10.5px] text-ink-3">{member?.userCode ?? '—'}</span>
            </span>
            <ChevronDown size={15} className="hidden text-ink-3 sm:block" />
          </button>

          {menu && (
            <div className="absolute right-0 top-[calc(100%+6px)] w-60 overflow-hidden rounded-[5px] border border-line bg-card shadow-raise">
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-[13px] font-semibold text-ink">{member?.name}</p>
                <p className="truncate text-[11.5px] text-ink-2">
                  {member?.userCode}{member?.rank ? ` · ${member.rank.name}` : ''}
                </p>
              </div>
              <button onClick={() => { setMenu(false); router.push('/profile'); }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-ink-2 transition hover:bg-canvas hover:text-ink">
                <User size={15} /> My profile
              </button>
              <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
                <span className="text-[13px] text-ink-2">Appearance</span>
                <ThemeToggle size="sm" />
              </div>
              <button onClick={logout}
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
