'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';

/**
 * Promotional card built on the FortuneX growth artwork.
 *
 * The art carries its subject on the RIGHT, so the copy sits left and a navy
 * scrim runs left→right to guarantee text contrast at every width. On narrow
 * screens the scrim deepens and the art recedes rather than competing with
 * the text — the card never becomes unreadable, it just becomes quieter.
 */
export function GrowNetworkCard({ className }: { className?: string }) {
  return (
    <article
      className={`relative isolate flex min-h-[190px] overflow-hidden rounded-[5px] bg-navy sm:min-h-[210px] ${className ?? ''}`}
    >
      <Image
        src="/brand/grow-network.png"
        alt=""
        aria-hidden
        fill
        priority={false}
        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 420px"
        className="-z-10 object-cover object-right"
      />

      {/* readability scrim — heavier on small screens where the art crowds in */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-navy via-navy/85 to-navy/10 sm:via-navy/70 sm:to-transparent"
      />

      <div className="relative flex max-w-[78%] flex-col justify-center gap-2 p-5 sm:max-w-[66%] xl:max-w-[74%]">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gold-hi ring-1 ring-gold-line/50">
          <Users size={12} strokeWidth={2.4} />
          Referral Program
        </span>

        <h3 className="text-[19px] font-bold leading-[1.2] tracking-[-0.015em] text-white">
          Grow Your Network
        </h3>

        <p className="max-w-[30ch] text-[12px] leading-[1.55] text-white/65">
          Invite new members and earn commission on every level of your team.
        </p>

        <Link
          href="/admin/network"
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-[4px] bg-gold px-4 py-2.5 text-[12.5px] font-semibold text-gold-on shadow-[0_6px_18px_-6px_rgba(255,122,26,0.55)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/25"
        >
          Invite Now
          <ArrowRight size={14} strokeWidth={2.5} />
        </Link>
      </div>
    </article>
  );
}
