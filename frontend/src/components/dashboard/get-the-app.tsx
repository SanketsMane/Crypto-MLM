'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Smartphone, X } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/primitives';

/**
 * Where the build lives, and the manifest that describes it.
 *
 * Both are served as static files by the proxy rather than bundled into this
 * app, so shipping a new APK is a file copy — it does not require rebuilding
 * and redeploying the website, and the version shown can never drift from the
 * file people actually download.
 */
const APK_URL = '/download/fortunex.apk';
const MANIFEST_URL = '/download/app.json';

const DISMISS_KEY = 'fx_app_banner_dismissed';

interface AppManifest {
  version: string;
  versionCode: number;
  sizeBytes: number;
  minAndroid: string;
  updatedAt: string;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function GetTheApp() {
  const [dismissed, setDismissed] = useState(true); // assume hidden until read
  const [qr, setQr] = useState<string | null>(null);

  /* Read on the client only. Deciding this during render would differ between
     the server pass and the browser, which React reports as a hydration
     mismatch and resolves by flashing the banner at someone who closed it. */
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false); // private mode: showing it is the safer default
    }
  }, []);

  const manifest = useQuery<AppManifest>({
    queryKey: ['app-manifest'],
    queryFn: async () => {
      const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('no manifest');
      return res.json();
    },
    // A missing manifest means no build has been published; the banner then
    // stays hidden rather than offering a download that 404s.
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    QRCode.toDataURL(`${window.location.origin}${APK_URL}`, {
      margin: 1,
      width: 320,
      color: { dark: '#0B1220', light: '#FFFFFF' },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, []);

  const close = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* nothing to do */ }
  };

  if (dismissed || !manifest.data) return null;
  const m = manifest.data;

  return (
    <section
      aria-labelledby="get-the-app-heading"
      className="relative overflow-hidden rounded-[14px] border border-line bg-gradient-to-br from-violet/[0.07] via-card to-card p-5"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-3 transition hover:bg-canvas hover:text-ink"
      >
        <X size={15} />
      </button>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-violet/10 text-violet">
          <Smartphone size={22} />
        </div>

        <div className="min-w-0 flex-1">
          <h2 id="get-the-app-heading" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            FortuneX for Android
          </h2>
          <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-ink-2">
            Check your balance, deposit, invest and withdraw from your phone. Your account, plan and
            network are exactly as they are here — signing in on the app changes nothing about how your
            account works.
          </p>
          <p className="mt-1.5 text-[11.5px] text-ink-3">
            Version {m.version} · {mb(m.sizeBytes)} · Android {m.minAndroid} or later
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            {/* A plain anchor, not a fetch-and-blob: the browser streams it
                straight to storage, shows its own progress, and can resume —
                none of which a JavaScript download gets right on a phone. */}
            <a href={APK_URL} download>
              <Button className="h-10">
                <Download size={15} /> Download for Android
              </Button>
            </a>
            <span className="text-[11.5px] text-ink-3">
              Not on the Play Store yet — you may need to allow installs from your browser.
            </span>
          </div>
        </div>

        {/* Scanning beats emailing yourself a link. Hidden on small screens,
            where the phone in question is the device already reading this. */}
        {qr && (
          <div className="hidden shrink-0 flex-col items-center gap-1.5 lg:flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt="QR code to download the FortuneX Android app"
              className="size-[104px] rounded-[10px] border border-line bg-white p-1.5"
            />
            <span className="text-[10.5px] text-ink-3">Scan to install</span>
          </div>
        )}
      </div>
    </section>
  );
}
