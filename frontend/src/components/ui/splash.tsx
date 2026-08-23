import Image from 'next/image';

/**
 * The screen shown while the app decides who you are.
 *
 * Deliberately the same navy as the manifest's `background_color` and the iOS
 * launch images: the OS paints the static launch image, this replaces it, and
 * because the plate matches there is no flash between the two — the only thing
 * that changes is that the rule underneath starts moving.
 *
 * Server-rendered, so it costs nothing and can be a route's `loading.tsx`.
 */
export function Splash({ label = 'Loading FortuneX' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label}
         className="grid min-h-screen place-items-center bg-navy px-6">
      <div className="flex flex-col items-center">
        <div className="relative h-[72px] w-[240px] sm:h-[86px] sm:w-[290px]">
          <Image src="/brand/Clearlogo.png" alt="FortuneX" fill priority
                 sizes="290px" className="object-contain" />
        </div>

        {/* indeterminate rule — a sweep rather than a spinner, because the wait
            is a handover rather than a task with progress to report */}
        <div aria-hidden className="relative mt-8 h-[2px] w-[132px] overflow-hidden rounded-full bg-white/10">
          <span className="fx-splash-sweep absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />
        </div>

        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}
