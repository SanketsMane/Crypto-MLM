import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Layers, ScrollText, ShieldCheck } from 'lucide-react';
import { getPlan, planMoney } from '@/lib/platform-config.server';

/** What `getPlan()` returns — the live plan, in the shapes this page renders. */
type Plan = Awaited<ReturnType<typeof getPlan>>;

const ASSURANCES = (plan: Plan) => [
  { Icon: ScrollText, text: 'Every payout is a ledger entry you can open' },
  { Icon: Layers, text: `A published ${plan.capPassivePercent}% earnings ceiling, enforced on every credit` },
  { Icon: ShieldCheck, text: 'Sessions are individually revocable, with two-factor available' },
];

/**
 * Sign-in, registration and password reset.
 *
 * A split screen rather than a lone card: the brand panel carries the artwork
 * and the three things worth knowing before you hand over a password, while
 * the form column stays narrow and undistracting. Below `lg` the panel is
 * dropped entirely — on a phone it would push the form below the fold.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const plan = await getPlan();

  return (
    <div data-site className="flex min-h-screen bg-navy-deep text-white [color-scheme:dark]">
      {/* ── brand panel ── */}
      <aside className="relative isolate hidden w-[46%] max-w-[620px] shrink-0 overflow-hidden border-r border-white/[0.07] lg:block">
        <Image src="/brand/sidebar-promo.png" alt="" aria-hidden fill priority sizes="620px"
               className="-z-20 object-cover object-[65%_center]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-navy-deep/85 via-navy-deep/70 to-navy-deep/95" />

        <div className="flex h-full flex-col justify-between p-10 xl:p-12">
          <Link href="/" className="relative block h-9 w-[150px]" aria-label="FortuneX — home">
            <Image src="/brand/Clearlogo.png" alt="FortuneX" fill sizes="150px"
                   className="object-contain object-left mix-blend-screen" />
          </Link>

          <div>
            <h2 className="max-w-[16ch] text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-white xl:text-[34px]">
              Trade. Invest. <span className="text-brand-gold">Earn.</span>
            </h2>
            <p className="mt-4 max-w-[38ch] text-[14px] leading-[1.75] text-white/60">
              A {plan.dailyReturnPercent}% daily trade bonus {plan.tradingDays}, a thirty-level network,
              executive ranks and the Roaming Club — settled in {plan.withdraw.network}.
            </p>

            <ul className="mt-8 space-y-3.5">
              {ASSURANCES(plan).map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-[13.5px] leading-relaxed text-white/65">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
                    <Icon size={14} strokeWidth={2} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[12px] leading-relaxed text-white/35">
            Trading carries risk, including loss of capital. Returns describe the compensation
            plan, not a guarantee.{' '}
            <Link href="/legal/risk-disclosure" className="text-white/50 underline underline-offset-2 hover:text-brand-gold">
              Risk disclosure
            </Link>
          </p>
        </div>
      </aside>

      {/* ── form column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="relative block h-8 w-[132px] lg:hidden" aria-label="FortuneX — home">
            <Image src="/brand/Clearlogo.png" alt="FortuneX" fill sizes="132px"
                   className="object-contain object-left mix-blend-screen" />
          </Link>
          <Link href="/"
                className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-white/50 transition hover:text-white">
            <ArrowLeft size={14} /> Back to site
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-[420px]">{children}</div>
        </main>

        <footer className="px-5 pb-6 sm:px-8">
          <p className="text-center text-[11.5px] text-white/30">
            © {new Date().getFullYear()} FortuneX ·{' '}
            <Link href="/legal/terms" className="hover:text-white/50">Terms</Link> ·{' '}
            <Link href="/legal/privacy" className="hover:text-white/50">Privacy</Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
