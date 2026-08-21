'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Check, Copy, Download, MessageCircle, Send as SendIcon, Share2, QrCode as QrIcon,
} from 'lucide-react';
import { get } from '@/lib/api';
import { Card, CardHead, Button, Skeleton, Metric } from '@/components/ui/primitives';

interface Profile {
  profile: { userCode: string; name: string; referralLink: string };
  team?: { directs: number };
}

/**
 * Everything a member needs to actually invite someone.
 *
 * Until now they got a link and nothing else — which puts the entire job of
 * explaining the platform on a person who joined last week. The pre-written
 * messages are the point: they are what gets sent, and a member who has to
 * compose one usually sends nothing.
 */
export default function InvitePage() {
  const me = useQuery<Profile>({
    queryKey: ['member', 'dashboard'],
    queryFn: () => get('/customer/dashboard'),
  });

  const link = me.data?.profile.referralLink ?? '';
  const code = me.data?.profile.userCode ?? '';
  const name = me.data?.profile.name ?? '';

  if (me.isLoading) {
    return <Card><div className="p-5"><Skeleton className="h-64" /></div></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <LinkCard link={link} code={code} />
          <MessagesCard link={link} name={name} />
        </div>
        <QrCard link={link} code={code} />
      </div>
    </div>
  );
}

// ── the link itself ───────────────────────────────────────────────────────

function LinkCard({ link, code }: { link: string; code: string }) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  const copy = async (value: string, which: 'link' | 'code') => {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 1600);
  };

  /** Uses the OS share sheet where there is one — on a phone that is the fast path. */
  const share = async () => {
    if (!navigator.share) return copy(link, 'link');
    try {
      await navigator.share({ title: 'Join me on FortuneX', url: link });
    } catch {
      // The member cancelled the sheet. Not an error.
    }
  };

  return (
    <Card>
      <CardHead
        title="Your invite link"
        subtitle="Anyone who signs up through this is placed directly under you."
      />
      <div className="space-y-3 px-5 pb-5">
        <div className="flex items-center gap-2 rounded-[10px] border border-line bg-canvas px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{link}</span>
          <button
            type="button"
            onClick={() => copy(link, 'link')}
            aria-label="Copy invite link"
            className="shrink-0 rounded-md p-1.5 text-ink-2 transition hover:bg-line/40 hover:text-ink"
          >
            {copied === 'link' ? <Check size={15} className="text-good" /> : <Copy size={15} />}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void share()}>
            <Share2 size={14} /> Share
          </Button>
          <Button variant="outline" onClick={() => copy(code, 'code')}>
            {copied === 'code' ? <Check size={14} className="text-good" /> : <Copy size={14} />}
            Copy ID {code}
          </Button>
        </div>

        <p className="text-[12px] leading-relaxed text-ink-2">
          They can also type your ID <strong className="font-medium text-ink">{code}</strong> into the
          sponsor field when signing up, if they reach the site another way.
        </p>
      </div>
    </Card>
  );
}

// ── pre-written messages ──────────────────────────────────────────────────

const MESSAGES = [
  {
    key: 'short',
    label: 'Short',
    hint: 'For a chat where they already know you',
    text: (link: string) =>
      `I've been using FortuneX — investment packages that pay a daily return, Monday to Friday. Have a look: ${link}`,
  },
  {
    key: 'explainer',
    label: 'With detail',
    hint: 'For someone who has not heard of it',
    text: (link: string, name: string) =>
      `Hi — ${name} here.\n\nI'm on FortuneX, a platform where you buy an investment package and earn a set daily return on it, Monday to Friday. There's also a referral side if you want to build a team, and everything pays out in USDT.\n\nThe whole compensation plan is published on the site, so you can read exactly how it works before putting anything in.\n\nHere's my link: ${link}`,
  },
  {
    key: 'honest',
    label: 'Straightforward',
    hint: 'Leads with the risk — often lands better',
    text: (link: string) =>
      `Worth a look if you're interested: FortuneX pays a daily return on investment packages and publishes the full plan, including the earnings cap and the fees.\n\nIt's an investment, so it carries risk and you should read the risk disclosure before deciding. If you want to look: ${link}`,
  },
] as const;

function MessagesCard({ link, name }: { link: string; name: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
    toast.success('Copied — paste it wherever you like');
  };

  return (
    <Card>
      <CardHead
        title="Something to send"
        subtitle="Copy one of these, or edit it into your own words."
      />
      <div className="space-y-3 px-5 pb-5">
        {MESSAGES.map((m) => {
          const text = m.text(link, name);
          return (
            <div key={m.key} className="rounded-[10px] border border-line bg-canvas p-3">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink">{m.label}</span>
                <span className="text-[11px] text-ink-3">{m.hint}</span>
              </div>
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">{text}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Button variant="outline" onClick={() => copy(m.key, text)}>
                  {copied === m.key ? <Check size={13} className="text-good" /> : <Copy size={13} />}
                  Copy
                </Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
                >
                  <MessageCircle size={13} /> WhatsApp
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
                >
                  <SendIcon size={13} /> Telegram
                </a>
              </div>
            </div>
          );
        })}

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Say only what is on the site. Promising a guaranteed return, or a figure the published plan
          does not support, is how a member ends up personally liable for what they told someone.
        </p>
      </div>
    </Card>
  );
}

// ── QR code ───────────────────────────────────────────────────────────────

/**
 * Drawn on a canvas rather than fetched from a QR service.
 *
 * A third-party image URL would leak every member's referral code to whoever
 * runs that service, and would break the moment it goes down or starts
 * rate-limiting. This encodes it here.
 */
function QrCard({ link, code }: { link: string; code: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!link || !canvas.current) return;
    let cancelled = false;

    void (async () => {
      const QRCode = (await import('qrcode')).default;
      if (cancelled || !canvas.current) return;
      await QRCode.toCanvas(canvas.current, link, {
        width: 240,
        margin: 2,
        color: { dark: '#071426', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      });
      setReady(true);
    })();

    return () => { cancelled = true; };
  }, [link]);

  const download = () => {
    if (!canvas.current) return;
    const a = document.createElement('a');
    a.href = canvas.current.toDataURL('image/png');
    a.download = `fortunex-invite-${code}.png`;
    a.click();
  };

  return (
    <Card>
      <CardHead title="QR code" subtitle="For printing, or showing on your phone." />
      <div className="flex flex-col items-center gap-3 px-5 pb-5">
        <div className="rounded-[12px] border border-line bg-white p-3">
          <canvas ref={canvas} className="block h-[240px] w-[240px]" />
          {!ready && (
            <div className="grid h-[240px] w-[240px] place-items-center text-ink-3">
              <QrIcon size={28} />
            </div>
          )}
        </div>
        <Button variant="outline" onClick={download} disabled={!ready} className="w-full">
          <Download size={14} /> Download PNG
        </Button>
        <p className="text-center text-[11.5px] leading-relaxed text-ink-3">
          Scanning it opens your invite link, so whoever signs up is placed under you.
        </p>
      </div>
    </Card>
  );
}
