import type { Metadata } from 'next';
import { Info, Plane, Trophy, Users } from 'lucide-react';
import { Container, Panel, Section, SectionHead } from '@/components/site/primitives';
import { PageHero } from '@/components/site/page-hero';
import { CtaBand } from '@/components/site/cta-band';
import { getPlan, planMoney } from '@/lib/platform-config.server';

export const metadata: Metadata = {
  title: 'Rewards & ranks',
  description:
    'The FortuneX affiliate structure: a three-level direct bonus, a thirty-level generation bonus, ten executive ranks and the Roaming Club travel awards.',
};

export default async function RewardsPage() {
  const plan = await getPlan();
  const directTotal = plan.directBonus.reduce((a, b) => a + b.percent, 0);

  return (
    <>
      <PageHero
        eyebrow="Rewards & ranks"
        title="Four ways the network pays"
        lead="Introductions, generations, rank achievements and travel. Each has its own qualification, and each is credited as its own line in your ledger so you can always see which stream produced a figure."
      />

      {/* ── direct bonus ──────────────────────────────────────────────── */}
      <Section>
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHead
                eyebrow="Stream one"
                title="Direct sponsor bonus"
                lead={`${directTotal}% of every tier purchased in your first three levels, paid at the moment of purchase and split across those levels.`}
              />
              <p className="mt-6 text-[13px] leading-relaxed text-white/60">
                It is paid inside the same transaction that creates the investment — if the
                purchase does not complete, the commission does not exist.
              </p>
            </div>
            <div className="lg:col-span-7">
              <div className="grid gap-3 sm:grid-cols-3">
                {plan.directBonus.map((d) => (
                  <Panel key={d.level} className="p-6 text-center">
                    <p className="text-[11.5px] uppercase tracking-[0.1em] text-white/60">Level {d.level}</p>
                    <p className="mt-2 text-[34px] font-semibold tracking-[-0.03em] text-brand-gold tabular-nums">{d.percent}%</p>
                    <p className="mt-1 text-[12px] text-white/60">
                      {d.level === 1 ? 'Members you introduce' : `Introduced by your level ${d.level - 1}`}
                    </p>
                  </Panel>
                ))}
              </div>
              <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-navy-card/50 px-5 py-4 text-[12.5px] leading-relaxed text-white/50">
                <Info size={15} className="mt-px shrink-0 text-brand-gold/70" />
                On a {planMoney(1_100)} purchase by someone you introduced, level one pays{' '}
                {planMoney(44)}. The same purchase pays {planMoney(5.5)} to each of the two
                sponsors above you.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── generation bonus ──────────────────────────────────────────── */}
      <Section tone="raised">
        <Container>
          <SectionHead
            eyebrow="Stream two"
            title="Generation bonus — thirty levels deep"
            lead="A share of the daily trade bonus earned anywhere beneath you, every trading day. Deeper bands unlock as your active directs and accumulated team volume grow."
          />

          <div className="mt-10 overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="bg-navy-deep/70">
                  {['Levels', 'Share of trade bonus', 'Active directs required', 'Team volume required'].map((h) => (
                    <th key={h} scope="col"
                        className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.generationBands.map((b) => (
                  <tr key={b.levels} className="border-t border-white/[0.06] transition-colors hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-5 py-4 text-[14px] font-medium tabular-nums text-white">Level {b.levels}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[15px] font-semibold tabular-nums text-brand-gold">{b.percent}%</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] tabular-nums text-white/65">
                      {b.directs === 0 ? <span className="text-white/58">None</span> : b.directs}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] tabular-nums text-white/65">
                      {b.volume === 0 ? <span className="text-white/58">None</span> : planMoney(b.volume)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 flex items-start gap-2.5 text-[12.5px] leading-relaxed text-white/60">
            <Users size={15} className="mt-px shrink-0 text-brand-gold/70" />
            Qualification is checked when the bonus is paid, not when you joined. If your active
            directs fall below a band&apos;s requirement, that band stops paying until it is met
            again — and the platform records what the shortfall withheld.
          </p>
        </Container>
      </Section>

      {/* ── ranks ─────────────────────────────────────────────────────── */}
      <Section>
        <Container>
          <SectionHead
            eyebrow="Stream three"
            title="Ten executive ranks"
            lead="Ranks qualify on two figures: capital you have committed yourself, and business accumulated across your team. Each is a one-off reward, awarded once and recorded against your account."
          />

          <div className="mt-10 overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="bg-navy-deep/70">
                  {['Rank', 'Self capital', 'Team business', 'Reward'].map((h) => (
                    <th key={h} scope="col"
                        className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.ranks.map((r, i) => (
                  <tr key={r.name} className="border-t border-white/[0.06] transition-colors hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-5 py-4">
                      <span className="flex items-center gap-2.5 text-[14px] font-medium text-white">
                        <Trophy size={14} className={i >= 7 ? 'text-brand-gold' : 'text-white/55'} />
                        {r.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] tabular-nums text-white/65">{planMoney(r.self)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[13.5px] tabular-nums text-white/65">{planMoney(r.team)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[15px] font-semibold tabular-nums text-brand-gold">{planMoney(r.reward)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </Section>

      {/* ── roaming club ──────────────────────────────────────────────── */}
      <Section tone="raised" id="roaming-club">
        <Container>
          <SectionHead
            eyebrow="Stream four"
            title="The Roaming Club"
            lead="International travel awards on two tracks — one for members who build a team, one for members who commit capital themselves. Roaming Club awards sit outside the earnings ceiling and never consume your cap."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <Panel className="p-6 sm:p-8">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-brand-gold/25 bg-brand-gold/10 text-brand-gold">
                <Users size={19} strokeWidth={1.9} />
              </span>
              <h3 className="mt-5 text-[17px] font-semibold text-white">Affiliate track</h3>
              <p className="mt-1.5 text-[13px] text-white/55">Qualifies on your own capital and your team&apos;s business together.</p>
              <ul className="mt-6 space-y-2.5">
                {plan.roaming.affiliate.map((t) => (
                  <li key={t.destination} className="flex items-center gap-3 rounded-lg px-3 py-2.5 odd:bg-white/[0.03]">
                    <Plane size={14} className="shrink-0 text-brand-gold/70" />
                    <span className="flex-1 text-[14px] font-medium text-white">{t.destination}</span>
                    <span className="text-[12.5px] tabular-nums text-white/50">
                      {planMoney(t.self)} self · {planMoney(t.team)} team
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel className="p-6 sm:p-8">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-brand-gold">
                <Trophy size={19} strokeWidth={1.9} />
              </span>
              <h3 className="mt-5 text-[17px] font-semibold text-white">Self-capitalist track</h3>
              <p className="mt-1.5 text-[13px] text-white/55">Qualifies on your own committed capital alone — no team requirement.</p>
              <ul className="mt-6 space-y-2.5">
                {plan.roaming.selfCapitalist.map((t) => (
                  <li key={t.destination} className="flex items-center gap-3 rounded-lg px-3 py-2.5 odd:bg-white/[0.03]">
                    <Plane size={14} className="shrink-0 text-brand-gold/70" />
                    <span className="flex-1 text-[14px] font-medium text-white">{t.destination}</span>
                    <span className="text-[12.5px] tabular-nums text-white/50">{planMoney(t.self)} self capital</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <p className="mt-4 text-[12.5px] leading-relaxed text-white/60">
            Qualification is evaluated automatically as your figures change. A qualified award is
            fulfilled by the operations team, and the arrangements are recorded against the award
            so both sides can see what was booked.
          </p>
        </Container>
      </Section>

      <CtaBand
        title="The network compounds what you build"
        lead="Open an account, introduce your first members, and every stream above becomes available under the same published rules."
      />
    </>
  );
}
