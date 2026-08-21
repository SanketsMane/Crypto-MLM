import { Card } from '@/components/ui/primitives';
import { Construction } from 'lucide-react';

/**
 * Used where the navigation shows a module the backend does not implement yet.
 * Saying so plainly is better than a screen of invented numbers.
 */
export function NotBuiltYet({ title, what, why }: { title: string; what: string; why: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-warn-soft text-warn">
          <Construction size={22} />
        </span>
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        <p className="max-w-[52ch] text-[13.5px] leading-relaxed text-ink-2">{what}</p>
        <p className="max-w-[52ch] text-[12.5px] leading-relaxed text-ink-3">{why}</p>
      </div>
    </Card>
  );
}
