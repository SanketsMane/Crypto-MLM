'use client';

import { useRef, useState } from 'react';
import { Paperclip, X, FileText, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export interface Attachment { fileName: string; mimeType: string; data: string }

/** Matches the server's document store — same limits, so nothing is rejected late. */
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 3;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/**
 * File picker for a ticket.
 *
 * A screenshot answers in one image what a paragraph of description cannot —
 * "the withdrawal page shows an error" versus the error itself. Limits are
 * enforced here as well as on the server so a member finds out before they have
 * typed a message, not after they press send.
 */
export function AttachmentPicker({
  files, onChange,
}: {
  files: (Attachment & { size: number })[];
  onChange: (files: (Attachment & { size: number })[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const next = [...files];
      for (const file of Array.from(list)) {
        if (next.length >= MAX_FILES) {
          toast.error(`You can attach ${MAX_FILES} files at most`);
          break;
        }
        if (!ACCEPTED.includes(file.type)) {
          toast.error(`${file.name} is not a supported type`, {
            description: 'Attach a JPEG, PNG, WebP or PDF.',
          });
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name} is too large`, { description: `The limit is ${kb(MAX_BYTES)}.` });
          continue;
        }
        next.push({
          fileName: file.name,
          mimeType: file.type,
          data: await toBase64(file),
          size: file.size,
        });
      }
      onChange(next);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED.join(',')}
        onChange={(e) => void add(e.target.files)}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy || files.length >= MAX_FILES}
        className="inline-flex items-center gap-1.5 rounded-[4px] border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink disabled:opacity-40"
      >
        <Paperclip size={13} />
        {files.length ? `${files.length}/${MAX_FILES} attached` : 'Attach a screenshot'}
      </button>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.fileName}-${i}`}
                className="flex items-center gap-2 rounded-[4px] border border-line bg-canvas px-2.5 py-1.5">
              {f.mimeType.startsWith('image/')
                ? <ImageIcon size={13} className="shrink-0 text-ink-3" />
                : <FileText size={13} className="shrink-0 text-ink-3" />}
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{f.fileName}</span>
              <span className="shrink-0 text-[11px] text-ink-3">{kb(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.fileName}`}
                      onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                      className="shrink-0 rounded p-0.5 text-ink-3 transition hover:text-bad">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Strips the data-URL prefix — the API wants the payload, not the wrapper. */
const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

/**
 * Shown against a message once it has been sent.
 *
 * Fetched and opened as a blob rather than linked directly: attachments sit
 * behind an authenticated endpoint, and a plain `<a href>` cannot carry a
 * bearer token. Fetching also means the file never needs a guessable public
 * URL, which is the point of storing it outside the web root.
 */
export function AttachmentList({
  attachments, fetcher,
}: {
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
  /** Returns the raw file for an attachment id. */
  fetcher: (id: string) => Promise<Blob>;
}) {
  const [opening, setOpening] = useState<string | null>(null);

  if (!attachments.length) return null;

  const open = async (id: string, fileName: string) => {
    setOpening(id);
    try {
      const blob = await fetcher(id);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener');
      if (!win) {
        // Popup blocked — fall back to a download so the file is not just lost.
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
      }
      // Give the tab time to load before releasing the URL.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error('Could not open that attachment');
    } finally {
      setOpening(null);
    }
  };

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => void open(a.id, a.fileName)}
            disabled={opening === a.id}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-card px-2 py-1 text-[11.5px] text-ink-2 transition hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            {a.mimeType.startsWith('image/')
              ? <ImageIcon size={12} /> : <FileText size={12} />}
            <span className="max-w-[160px] truncate">{a.fileName}</span>
            <span className="text-ink-3">{kb(a.sizeBytes)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
