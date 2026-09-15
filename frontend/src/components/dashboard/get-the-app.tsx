'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';

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

/**
 * Remembered per BUILD, not per member.
 *
 * Keying on the version means dismissing this release does not also silence
 * the next one — but re-announcing the same build every sign-in would be
 * nagging, and nagging is how people learn to close a dialog without reading it.
 */
const dismissKey = (version: string) => `fx_app_promo_dismissed_${version}`;

interface AppManifest {
  version: string;
  versionCode: number;
  sizeBytes: number;
  minAndroid: string;
  updatedAt: string;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function GetTheApp() {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const manifest = useQuery<AppManifest>({
    queryKey: ['app-manifest'],
    queryFn: async () => {
      const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('no manifest');
      return res.json();
    },
    // A missing manifest means no build has been published; nothing is shown
    // rather than offering a download that 404s.
    retry: false,
    staleTime: 5 * 60_000,
    /* ...and nothing is SAID either. Without this the global query-error
       toaster turned "no Android build published yet" into a red error on
       every dashboard load, contradicting the line above. */
    meta: { silent: true },
  });

  const version = manifest.data?.version;

  /* Opened from an effect, never during render. Reading localStorage inline
     differs between the server pass and the browser, which React resolves by
     flashing the dialog at somebody who already closed it. */
  useEffect(() => {
    if (!version) return;
    let seen = false;
    try {
      seen = localStorage.getItem(dismissKey(version)) === '1';
    } catch {
      seen = false; // private mode: showing it once is the safer default
    }
    if (!seen) setOpen(true);
  }, [version]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    QRCode.toDataURL(`${window.location.origin}${APK_URL}`, {
      margin: 1,
      width: 360,
      color: { dark: '#0B1220', light: '#FFFFFF' },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [open]);

  const close = () => {
    setOpen(false);
    if (!version) return;
    try { localStorage.setItem(dismissKey(version), '1'); } catch { /* nothing to do */ }
  };

  const m = manifest.data;
  if (!m) return null;

  return (
    <Modal
      open={open}
      onClose={close}
      width="lg"
      title="Get the Android app"
      description="Check your balance, deposit, invest and withdraw from your phone. Your account, plan and network are exactly as they are here — signing in on the app changes nothing about how your account works."
      icon={
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[5px] bg-violet/10 text-violet">
          <Smartphone size={20} />
        </div>
      }
      footer={
        <>
          <button
            type="button"
            onClick={close}
            className="rounded-[4px] px-3 py-2 text-[12.5px] text-ink-2 transition hover:text-ink"
          >
            Maybe later
          </button>
          {/* A plain anchor, not a fetch-and-blob: the browser streams it
              straight to storage, shows its own progress and can resume — none
              of which a JavaScript download gets right on a phone.
              `onClick` closes the dialog so the member is not left staring at
              it while the download runs behind. */}
          <a href={APK_URL} download onClick={close}>
            <Button size="sm">
              <Download size={15} /> Download for Android
            </Button>
          </a>
        </>
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="rounded-[5px] border border-line bg-canvas px-3 py-2.5">
            <p className="text-[10.5px] uppercase tracking-[0.04em] text-ink-2">This release</p>
            <p className="mt-0.5 text-[13px] font-semibold text-ink">
              Version {m.version} · {mb(m.sizeBytes)}
            </p>
            <p className="text-[11.5px] text-ink-3">Requires Android {m.minAndroid} or later</p>
          </div>
          <p className="text-[11.5px] leading-relaxed text-ink-3">
            Not on the Play Store yet, so your phone will ask permission to install it from your
            browser. That prompt is normal for apps installed this way.
          </p>
        </div>

        {/* Scanning beats emailing yourself a link. Hidden on small screens,
            where the phone in question is the device already reading this. */}
        {qr && (
          <div className="hidden shrink-0 flex-col items-center gap-1.5 sm:flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt="QR code to download the Android app"
              className="size-[112px] rounded-[5px] border border-line bg-white p-1.5"
            />
            <span className="text-[10.5px] text-ink-3">Scan to install</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
